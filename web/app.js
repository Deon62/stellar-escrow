/**
 * Lumenswags UI — 3-step flow: Welcome → Connect → Contract → Dashboard
 * Freighter + Stellar testnet
 */

import { Server } from "@stellar/stellar-sdk/rpc";
import { Contract, TransactionBuilder, Keypair, StrKey, Account, Address, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";

const RPC_URL = "/rpc";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const TESTNET_XLM_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const STATE_NAMES = { 0: "Created", 1: "Funded", 2: "Shipped", 3: "Released" };

let walletPublicKey = null;
let contractId = null;
let isInvoking = false;
let demoSellerKeypair = null;

// ——— Utilities ———

function getFreighter() {
  return window?.freighterApi || null;
}

function showMessage(text, type = "info") {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = text;
  el.className = "message show " + type;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => el.classList.remove("show"), 4000);
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

function normalizeContractId(input) {
  if (!input || typeof input !== "string") return "";
  return input.trim().replace(/\s+/g, "").replace(/[\u200B-\u200D\uFEFF]/g, "").toUpperCase().slice(0, 56);
}

function tryResolveContractId(id) {
  if (!id || id.length !== 56 || !id.startsWith("C")) return null;
  
  try {
    if (StrKey.isValidContract(id)) return id;
  } catch {}
  
  // Try fixing common typos: 1↔I, 0↔O
  const afterC = id.slice(1);
  const fixes = [
    afterC.replace(/1/g, "I").replace(/0/g, "O"),
    afterC.replace(/1/g, "I"),
    afterC.replace(/0/g, "O"),
  ];
  for (const fixed of fixes) {
    const candidate = "C" + fixed;
    try {
      if (StrKey.isValidContract(candidate)) return candidate;
    } catch {}
  }
  return null;
}

// ——— UI State ———

function goToStep(step) {
  const steps = document.querySelectorAll(".step");
  const stepper = document.getElementById("stepper");
  const items = document.querySelectorAll(".stepper-item");

  steps.forEach(s => { s.classList.remove("step-active"); s.hidden = true; });
  items.forEach(i => { i.classList.remove("active", "done"); });

  const current = document.querySelector(`.step[data-step="${step}"]`);
  if (current) { current.hidden = false; current.classList.add("step-active"); }

  stepper.hidden = step === 1;
  if (step > 1) {
    items.forEach((item, idx) => {
      if (idx + 1 < step) item.classList.add("done");
      else if (idx + 1 === step) item.classList.add("active");
    });
  }
}

function updateWalletDisplay() {
  const short = walletPublicKey ? `${walletPublicKey.slice(0, 6)}…${walletPublicKey.slice(-6)}` : "—";
  setEl("walletAddress", short);
  setEl("walletAddressDashboard", short);
  
  // Update connect button state
  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  
  if (walletPublicKey) {
    if (connectBtn) { connectBtn.textContent = "Connected"; connectBtn.disabled = true; }
    if (disconnectBtn) disconnectBtn.hidden = false;
  } else {
    if (connectBtn) { connectBtn.textContent = "Connect wallet"; connectBtn.disabled = false; }
    if (disconnectBtn) disconnectBtn.hidden = true;
  }
}

function updateContractDisplay() {
  const short = contractId ? `${contractId.slice(0, 8)}…${contractId.slice(-6)}` : "—";
  setEl("contractIdShort", short);
}

// ——— Wallet Connection ———

async function connectWallet() {
  const freighter = getFreighter();
  if (!freighter) {
    showMessage("Freighter not detected. Install the extension and refresh.", "error");
    return;
  }
  
  const btn = document.getElementById("connectBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Connecting…';
  btn.classList.add("btn-loading");
  
  try {
    const connected = await freighter.isConnected();
    if (!(connected === true || connected?.isConnected)) {
      showMessage("Freighter not connected. Unlock the extension and try again.", "error");
      return;
    }
    
    const result = await freighter.requestAccess();
    if (result?.error) {
      showMessage(result.error, "error");
      return;
    }
    
    let pub = result?.address ?? await freighter.getPublicKey?.() ?? await freighter.getAddress?.();
    if (pub && typeof pub === "object") pub = pub.address;
    
    if (!pub || typeof pub !== "string") {
      showMessage("No address returned. Approve in Freighter and retry.", "error");
      return;
    }
    
    walletPublicKey = pub;
    updateWalletDisplay();
    showMessage("Wallet connected!", "success");
    goToStep(2);
  } catch (e) {
    showMessage(e?.message || "Connection failed.", "error");
  } finally {
    btn.classList.remove("btn-loading");
    updateWalletDisplay();
  }
}

function disconnectWallet() {
  walletPublicKey = null;
  contractId = null;
  updateWalletDisplay();
  showMessage("Wallet disconnected.", "info");
  goToStep(1);
}

// ——— Contract Simulation (read-only) ———

async function simulateContract(methodName, args = [], id = contractId) {
  const server = new Server(RPC_URL, { allowHttp: true });
  const contract = new Contract(String(id));
  const account = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
  
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(180)
    .build();
  
  const sim = await server.simulateTransaction(tx);
  if (sim.error) throw new Error(sim.error);
  return sim.result?.retval;
}

// ——— Contract Invocation (write) ———

async function invokeContract(methodName, args = [], retryCount = 0) {
  if (isInvoking && retryCount === 0) {
    showMessage("Transaction in progress…", "info");
    return false;
  }
  isInvoking = true;
  
  const buttons = document.querySelectorAll("#createBtn, #approveBtn, #fundBtn, #markShippedBtn, #confirmBtn");
  buttons.forEach(b => b.disabled = true);
  
  const freighter = getFreighter();
  if (!freighter?.signTransaction) {
    showMessage("Freighter required for signing.", "error");
    cleanup();
    return false;
  }
  
  if (!walletPublicKey || !contractId) {
    showMessage("Connect wallet and load a contract first.", "error");
    cleanup();
    return false;
  }
  
  const server = new Server(RPC_URL, { allowHttp: true });
  const contract = new Contract(String(contractId));
  
  // Small delay before fetching account to let network settle
  if (retryCount > 0) {
    showMessage(`Retrying (${retryCount}/3)...`, "info");
    await new Promise(r => setTimeout(r, 2000));
  }
  
  let account;
  try {
    account = await server.getAccount(walletPublicKey);
  } catch {
    showMessage("Account not found. Fund it via Friendbot first.", "error");
    cleanup();
    return false;
  }
  
  let op, simulation;
  try {
    op = contract.call(methodName, ...args);
    const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(op)
      .setTimeout(180)
      .build();
    
    simulation = await server.simulateTransaction(tx);
    if (simulation.error) throw new Error(simulation.error);
    if (!simulation.transactionData) throw new Error("No transaction data from simulation");
  } catch (e) {
    showMessage("Simulation failed: " + e.message, "error");
    cleanup();
    return false;
  }
  
  // Re-fetch account right before building final transaction (freshest sequence)
  try {
    account = await server.getAccount(walletPublicKey);
  } catch {
    showMessage("Account fetch failed.", "error");
    cleanup();
    return false;
  }
  
  let prepared;
  try {
    const sorobanData = simulation.transactionData.build();
    const totalFee = (10000 + Number(simulation.minResourceFee || 0)).toString();
    const authEntries = simulation.result?.auth || [];
    
    const { Operation, xdr } = await import("@stellar/stellar-sdk");
    const hostFunc = op.body().invokeHostFunctionOp().hostFunction();
    const parsedAuth = authEntries.map(a => typeof a === 'string' ? xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64') : a);
    
    const opWithAuth = Operation.invokeHostFunction({ func: hostFunc, auth: parsedAuth });
    
    prepared = new TransactionBuilder(account, { fee: totalFee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(opWithAuth)
      .setTimeout(180)
      .setSorobanData(sorobanData)
      .build();
  } catch (e) {
    showMessage("Failed to prepare transaction: " + e.message, "error");
    cleanup();
    return false;
  }
  
  let signedXdr;
  try {
    const signResult = await freighter.signTransaction(prepared.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
    signedXdr = typeof signResult === "string" ? signResult : signResult?.signedTxXdr;
    if (!signedXdr) throw new Error("No signed XDR returned");
  } catch (e) {
    showMessage("Signing cancelled or failed.", "error");
    cleanup();
    return false;
  }
  
  try {
    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    const sendResult = await server.sendTransaction(signedTx);
    
    if (sendResult.status === "ERROR") {
      const code = sendResult.errorResult?.result?.()?.switch?.()?.name;
      
      // Auto-retry on sequence errors (up to 3 times)
      if (code === "txBadSeq" && retryCount < 3) {
        cleanup();
        return invokeContract(methodName, args, retryCount + 1);
      }
      
      showMessage(code === "txBadSeq" ? "Sequence error - please wait a moment and try again." : `Transaction failed: ${code || "unknown"}`, "error");
      cleanup();
      return false;
    }
    
    if (sendResult.status === "PENDING") {
      showMessage("Submitted, confirming…", "info");
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const result = await server.getTransaction(sendResult.hash);
          if (result.status === "SUCCESS") {
            showMessage(`${methodName} succeeded!`, "success");
            cleanup();
            return true;
          }
          if (result.status === "FAILED") {
            showMessage(`${methodName} failed on-chain.`, "error");
            cleanup();
            return false;
          }
        } catch {}
      }
      showMessage("Timeout - check Stellar Expert.", "error");
      cleanup();
      return false;
    }
    
    if (sendResult.status === "SUCCESS") {
      showMessage(`${methodName} succeeded!`, "success");
      cleanup();
      return true;
    }
    
    showMessage(`Unexpected status: ${sendResult.status}`, "error");
    cleanup();
    return false;
  } catch (e) {
    showMessage("Send failed: " + e.message, "error");
    cleanup();
    return false;
  }
  
  function cleanup() {
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
  }
}

// ——— Escrow Operations ———

async function loadEscrow() {
  const input = normalizeContractId(document.getElementById("contractId")?.value || "");
  
  if (!input) {
    showMessage("Enter a contract ID.", "error");
    return;
  }
  if (!input.startsWith("C") || input.length !== 56) {
    showMessage("Contract ID must be 56 characters starting with C.", "error");
    return;
  }
  
  const resolved = tryResolveContractId(input);
  if (!resolved) {
    showMessage("Invalid contract ID checksum.", "error");
    return;
  }
  
  contractId = resolved;
  
  try {
    let state = null, buyer = "—", seller = "—", amount = "—", evidence = "—";
    let notInitialized = false;
    
    try {
      const stateResult = await simulateContract("get_state", [], resolved);
      state = stateResult ? scValToNative(stateResult) : null;
    } catch (e) {
      if (e.message?.includes("UnreachableCodeReached") || e.message?.includes("InvalidAction")) {
        notInitialized = true;
      } else throw e;
    }
    
    if (!notInitialized && state !== null) {
      const [b, s, a, e] = await Promise.allSettled([
        simulateContract("get_buyer", [], resolved),
        simulateContract("get_seller", [], resolved),
        simulateContract("get_amount", [], resolved),
        simulateContract("get_evidence", [], resolved),
      ]);
      
      if (b.status === "fulfilled" && b.value) buyer = scValToNative(b.value)?.toString() || "—";
      if (s.status === "fulfilled" && s.value) seller = scValToNative(s.value)?.toString() || "—";
      if (a.status === "fulfilled" && a.value) amount = String(scValToNative(a.value));
      if (e.status === "fulfilled" && e.value) evidence = scValToNative(e.value)?.toString() || "—";
    }
    
    setEl("stateValue", notInitialized ? "Not initialized" : (STATE_NAMES[state] ?? state ?? "—"));
    setEl("buyerValue", buyer);
    setEl("sellerValue", seller);
    setEl("amountValue", amount);
    setEl("evidenceValue", evidence);
    updateContractDisplay();
    
    showMessage(notInitialized ? "Contract loaded. Create an escrow to start." : "Escrow loaded.", "success");
    goToStep(3);
  } catch (e) {
    showMessage("Load failed: " + e.message, "error");
  }
}

async function createEscrow() {
  const sellerInput = document.getElementById("sellerInput")?.value?.trim();
  const amountInput = document.getElementById("amountInput")?.value?.trim();
  let tokenInput = document.getElementById("tokenInput")?.value?.trim() || TESTNET_XLM_TOKEN;
  
  if (!sellerInput) {
    showMessage("Enter a seller address.", "error");
    return;
  }
  if (!amountInput || isNaN(amountInput) || Number(amountInput) <= 0) {
    showMessage("Enter a valid amount.", "error");
    return;
  }
  if (!StrKey.isValidEd25519PublicKey(sellerInput) && !StrKey.isValidContract(sellerInput)) {
    showMessage("Invalid seller address.", "error");
    return;
  }
  if (!StrKey.isValidContract(tokenInput)) {
    showMessage("Invalid token contract.", "error");
    return;
  }
  
  const args = [
    new Address(walletPublicKey).toScVal(),
    new Address(sellerInput).toScVal(),
    nativeToScVal(BigInt(amountInput), { type: "i128" }),
    new Address(tokenInput).toScVal(),
  ];
  
  if (await invokeContract("create", args)) {
    await loadEscrow();
  }
}

async function approveTokens() {
  // Get the token and amount from the current escrow
  const amountEl = document.getElementById("amountValue");
  const tokenEl = document.getElementById("tokenInput");
  
  const amountStr = amountEl?.textContent?.trim();
  const tokenAddress = tokenEl?.value?.trim() || TESTNET_XLM_TOKEN;
  
  if (!amountStr || amountStr === "—") {
    showMessage("Load an escrow first to see the amount.", "error");
    return;
  }
  
  const amount = BigInt(amountStr);
  if (amount <= 0n) {
    showMessage("Invalid amount.", "error");
    return;
  }
  
  // Approve with some buffer (2x amount) and reasonable expiration (~1 week)
  const approveAmount = amount * 2n;
  // Get current ledger and add ~200000 (~1 week on testnet)
  const server = new Server(RPC_URL, { allowHttp: true });
  let expirationLedger;
  try {
    const health = await server.getHealth();
    expirationLedger = (health.latestLedger || 3000000) + 200000;
  } catch {
    expirationLedger = 3200000; // Fallback
  }
  
  // Call the token contract's approve function
  const args = [
    new Address(walletPublicKey).toScVal(),           // from (buyer)
    new Address(contractId).toScVal(),                 // spender (escrow contract)
    nativeToScVal(approveAmount, { type: "i128" }),    // amount
    nativeToScVal(expirationLedger, { type: "u32" }),  // expiration_ledger
  ];
  
  // Temporarily set contractId to token contract for this call
  const originalContractId = contractId;
  contractId = tokenAddress;
  
  const success = await invokeContract("approve", args);
  
  // Restore escrow contract ID
  contractId = originalContractId;
  
  if (success) {
    showMessage("Tokens approved! Now click 'Fund escrow'.", "success");
  }
}

async function fundEscrow() {
  if (await invokeContract("fund", [])) await loadEscrow();
}

async function markShipped() {
  const evidence = document.getElementById("evidenceInput")?.value?.trim() || "Shipped";
  const args = [nativeToScVal(evidence, { type: "string" })];
  if (await invokeContract("mark_shipped", args)) await loadEscrow();
}

async function confirmDelivery() {
  if (await invokeContract("confirm_delivery", [])) await loadEscrow();
}

function goToDifferentContract() {
  document.getElementById("contractId").value = contractId || "";
  goToStep(2);
}

// ——— Event Bindings ———

// ——— Demo Seller (no Freighter needed) ———

async function generateDemoSeller() {
  const btn = document.getElementById("generateSellerBtn");
  const addressEl = document.getElementById("demoSellerAddress");
  const resultEl = document.getElementById("sellerResult");
  const sellerInput = document.getElementById("sellerInput");
  
  btn.disabled = true;
  btn.textContent = "Generating...";
  
  try {
    // Generate new keypair
    demoSellerKeypair = Keypair.random();
    const publicKey = demoSellerKeypair.publicKey();
    
    // Show full address
    addressEl.textContent = publicKey;
    
    // Fund via Friendbot
    showMessage("Funding account via Friendbot...", "info");
    const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
    
    if (!response.ok) {
      throw new Error("Friendbot funding failed");
    }
    
    // Show result and auto-fill seller input
    if (resultEl) resultEl.hidden = false;
    if (sellerInput) sellerInput.value = publicKey;
    
    showMessage("Demo seller created & auto-filled! Now click Create Escrow.", "success");
    btn.textContent = "Generated ✓";
    
  } catch (e) {
    showMessage("Failed to create demo seller: " + e.message, "error");
    btn.disabled = false;
    btn.textContent = "Generate & Fund Seller";
  }
}

function copySellerAddress() {
  if (demoSellerKeypair) {
    navigator.clipboard?.writeText(demoSellerKeypair.publicKey());
    showMessage("Seller address copied!", "success");
  }
}

async function demoSellerShip() {
  if (!demoSellerKeypair) {
    showMessage("Generate a demo seller first (Step A).", "error");
    return;
  }
  
  if (!contractId) {
    showMessage("Load a contract first.", "error");
    return;
  }
  
  const evidence = document.getElementById("demoEvidenceInput")?.value?.trim() || "SHIPPED";
  const sellerPubKey = demoSellerKeypair.publicKey();
  
  // Check if this keypair matches the escrow seller
  const sellerInEscrow = document.getElementById("sellerValue")?.textContent?.trim();
  if (sellerInEscrow && sellerInEscrow !== "—" && !sellerInEscrow.includes(sellerPubKey.slice(0,8))) {
    showMessage(`Demo seller doesn't match escrow. Make sure you created the escrow with this seller.`, "error");
    return;
  }
  
  const btn = document.getElementById("demoShipBtn");
  btn.disabled = true;
  btn.textContent = "Shipping...";
  
  try {
    const server = new Server(RPC_URL, { allowHttp: true });
    const contract = new Contract(String(contractId));
    
    let account = await server.getAccount(sellerPubKey);
    
    const evidenceScVal = nativeToScVal(evidence, { type: "string" });
    const op = contract.call("mark_shipped", evidenceScVal);
    
    const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(op)
      .setTimeout(180)
      .build();
    
    const simulation = await server.simulateTransaction(tx);
    if (simulation.error) throw new Error(simulation.error);
    
    // Re-fetch account for fresh sequence
    account = await server.getAccount(sellerPubKey);
    
    const sorobanData = simulation.transactionData.build();
    const totalFee = (10000 + Number(simulation.minResourceFee || 0)).toString();
    const authEntries = simulation.result?.auth || [];
    
    const { Operation, xdr } = await import("@stellar/stellar-sdk");
    const hostFunc = op.body().invokeHostFunctionOp().hostFunction();
    const parsedAuth = authEntries.map(a => typeof a === 'string' ? xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64') : a);
    
    const opWithAuth = Operation.invokeHostFunction({ func: hostFunc, auth: parsedAuth });
    
    const prepared = new TransactionBuilder(account, { fee: totalFee, networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(opWithAuth)
      .setTimeout(180)
      .setSorobanData(sorobanData)
      .build();
    
    // Sign with keypair directly (no Freighter)
    prepared.sign(demoSellerKeypair);
    
    const sendResult = await server.sendTransaction(prepared);
    
    if (sendResult.status === "ERROR") {
      throw new Error(sendResult.errorResult?.result?.()?.switch?.()?.name || "Transaction failed");
    }
    
    if (sendResult.status === "PENDING") {
      showMessage("Submitted, confirming...", "info");
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const result = await server.getTransaction(sendResult.hash);
          if (result.status === "SUCCESS") {
            showMessage("Shipped! Now confirm delivery as buyer.", "success");
            await loadEscrow();
            btn.textContent = "Ship as Demo Seller";
            btn.disabled = false;
            return;
          }
          if (result.status === "FAILED") throw new Error("Transaction failed on-chain");
        } catch {}
      }
    }
    
    showMessage("Shipped successfully!", "success");
    await loadEscrow();
  } catch (e) {
    showMessage("Ship failed: " + e.message, "error");
  } finally {
    btn.textContent = "Ship as Demo Seller";
    btn.disabled = false;
  }
}

function init() {
  document.getElementById("connectBtn")?.addEventListener("click", connectWallet);
  document.getElementById("disconnectBtn")?.addEventListener("click", disconnectWallet);
  document.getElementById("disconnectDashboardBtn")?.addEventListener("click", disconnectWallet);
  document.getElementById("backToWelcomeBtn")?.addEventListener("click", () => goToStep(1));
  document.getElementById("loadBtn")?.addEventListener("click", loadEscrow);
  document.getElementById("differentContractBtn")?.addEventListener("click", goToDifferentContract);
  document.getElementById("createBtn")?.addEventListener("click", createEscrow);
  document.getElementById("approveBtn")?.addEventListener("click", approveTokens);
  document.getElementById("fundBtn")?.addEventListener("click", fundEscrow);
  document.getElementById("markShippedBtn")?.addEventListener("click", markShipped);
  document.getElementById("confirmBtn")?.addEventListener("click", confirmDelivery);
  document.getElementById("generateSellerBtn")?.addEventListener("click", generateDemoSeller);
  document.getElementById("demoShipBtn")?.addEventListener("click", demoSellerShip);
  document.getElementById("copySellerBtn")?.addEventListener("click", copySellerAddress);
}

init();
