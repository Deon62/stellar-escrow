/**
 * Lumenswags UI — 3-step flow: Welcome → Connect → Contract → Dashboard
 * Freighter + Stellar testnet (Gateway RPC).
 * Run: npm install && npm run dev (SDK is bundled; no CDN/CORS).
 */

import { Server } from "@stellar/stellar-sdk/rpc";
import { Contract, TransactionBuilder, Keypair, StrKey, Account, Address, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";

// Use proxy path in dev (Vite proxies /rpc → Stellar testnet RPC to bypass CORS)
const RPC_URL = "/rpc";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// Testnet native XLM token contract (wrapped XLM for Soroban)
const TESTNET_XLM_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const STATE_NAMES = { 0: "Created", 1: "Funded", 2: "Shipped", 3: "Released" };

let walletPublicKey = null;
let contractId = null;

/** No-op when using bundled SDK; kept for compatibility. */
async function loadStellarSdk() {}

function normalizeContractId(input) {
  if (!input || typeof input !== "string") return "";
  return input
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toUpperCase()
    .slice(0, 56);
}

// If ID fails checksum, try fixing common copy-paste mix-ups (1↔I, 0↔O). Returns valid ID or null.
function tryResolveContractId(id) {
  console.log("[DEBUG] tryResolveContractId called with:", JSON.stringify(id));
  console.log("[DEBUG] id length:", id?.length, "starts with C:", id?.startsWith?.("C"));
  console.log("[DEBUG] char codes:", id ? [...id].map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(" ") : "N/A");
  
  if (!id || id.length !== 56 || !id.startsWith("C")) {
    console.log("[DEBUG] Early return: id empty, wrong length, or wrong start");
    return null;
  }
  
  try {
    console.log("[DEBUG] StrKey available:", typeof StrKey, "isValidContract:", typeof StrKey?.isValidContract);
    const isValid = StrKey.isValidContract(id);
    console.log("[DEBUG] StrKey.isValidContract returned:", isValid);
    if (isValid) return id;
  } catch (err) {
    console.log("[DEBUG] StrKey.isValidContract threw:", err?.message || err);
  }
  
  const afterC = id.slice(1);
  const fixes = [
    afterC.replace(/1/g, "I").replace(/0/g, "O"),
    afterC.replace(/1/g, "I"),
    afterC.replace(/0/g, "O"),
  ];
  for (const fixed of fixes) {
    const candidate = "C" + fixed;
    try {
      const isValid = StrKey.isValidContract(candidate);
      console.log("[DEBUG] Trying fixed candidate:", candidate.slice(0, 10) + "...", "isValid:", isValid);
      if (isValid) return candidate;
    } catch (err) {
      console.log("[DEBUG] Fixed candidate threw:", err?.message || err);
    }
  }
  console.log("[DEBUG] All attempts failed, returning null");
  return null;
}

function getFreighter() {
  return typeof window !== "undefined" && window.freighterApi ? window.freighterApi : null;
}

function showMessage(text, type = "info") {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = "message show " + type;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => el.classList.remove("show"), 4000);
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

// ——— Step flow ———
function goToStep(step) {
  const steps = document.querySelectorAll(".step");
  const stepper = document.getElementById("stepper");
  const items = document.querySelectorAll(".stepper-item");

  steps.forEach((s) => {
    s.classList.remove("step-active");
    s.hidden = true;
  });
  items.forEach((i) => {
    i.classList.remove("active", "done");
    const dot = i.querySelector(".stepper-dot");
    if (dot) dot.setAttribute("aria-current", "false");
  });

  const current = document.querySelector(`.step[data-step="${step}"]`);
  if (current) {
    current.hidden = false;
    current.classList.add("step-active");
  }

  if (step === 1) {
    stepper.hidden = true;
  } else {
    stepper.hidden = false;
    items.forEach((i, idx) => {
      const n = idx + 1;
      if (n < step) i.classList.add("done");
      else if (n === step) {
        i.classList.add("active");
        const dot = i.querySelector(".stepper-dot");
        if (dot) dot.setAttribute("aria-current", "true");
      }
    });
  }
}

function setWalletDisplay() {
  const short = walletPublicKey
    ? walletPublicKey.slice(0, 6) + "…" + walletPublicKey.slice(-6)
    : "—";
  setEl("walletAddress", short);
  setEl("walletAddressDashboard", short);
}

function setContractDisplay() {
  const short = contractId
    ? contractId.slice(0, 8) + "…" + contractId.slice(-6)
    : "—";
  setEl("contractIdShort", short);
}

// Connect wallet (Freighter) — uses script-loaded window.freighterApi; no backend required
async function connectWallet() {
  const btn = document.getElementById("connectBtn");
  const freighter = getFreighter();
  if (!freighter) {
    showMessage("Freighter not detected. Load the page over HTTP and ensure the Freighter extension is installed and enabled for this site.", "error");
    return;
  }
  setConnectLoading(true);
  try {
    const connected = await freighter.isConnected();
    const isConnected = connected === true || connected?.isConnected === true;
    if (!isConnected) {
      showMessage(connected?.error || "Freighter extension not connected. Open the extension and unlock/sign in, then try again.", "error");
      return;
    }
    const result = await freighter.requestAccess();
    if (result?.error) {
      showMessage(result.error, "error");
      return;
    }
    let pub = result?.address ?? (await freighter.getPublicKey?.()) ?? (await freighter.getAddress?.());
    if (pub && typeof pub === "object" && "address" in pub) pub = pub.address;
    if (!pub || typeof pub !== "string") {
      showMessage("No address returned. Approve the connection in Freighter and try again.", "error");
      return;
    }
    walletPublicKey = pub;
    setWalletDisplay();
    btn.textContent = "Connected";
    btn.disabled = true;
    btn.classList.remove("btn-loading");
    showMessage("Wallet connected.", "success");
    goToStep(2);
  } catch (e) {
    showMessage(e?.message || "Could not connect wallet.", "error");
  } finally {
    setConnectLoading(false);
  }
}

function setConnectLoading(loading) {
  const btn = document.getElementById("connectBtn");
  if (!btn) return;
  if (loading) {
    if (!btn.classList.contains("btn-loading")) {
      btn.dataset.originalText = btn.textContent.trim() || "Connect wallet";
    }
    btn.disabled = true;
    btn.classList.add("btn-loading");
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span> Connecting…';
  } else {
    btn.classList.remove("btn-loading");
    if (btn.textContent !== "Connected") {
      btn.textContent = btn.dataset.originalText || "Connect wallet";
    }
    btn.disabled = btn.textContent === "Connected";
  }
}

// Back to welcome
function backToWelcome() {
  goToStep(1);
}

// Different contract (dashboard → contract step)
function differentContract() {
  document.getElementById("contractId").value = contractId || "";
  goToStep(2);
}

// Build, sign with Freighter, send
let isInvoking = false; // Prevent double-clicks

async function invokeContract(methodName, args = []) {
  if (isInvoking) {
    showMessage("Transaction in progress, please wait...", "info");
    return false;
  }
  isInvoking = true;
  
  // Disable all action buttons while transaction is in progress
  const buttons = document.querySelectorAll("#createBtn, #fundBtn, #markShippedBtn, #confirmBtn");
  buttons.forEach(b => b.disabled = true);
  
  console.log("[invokeContract] method:", methodName, "args:", args);
  await loadStellarSdk();
  const freighter = getFreighter();
  if (!freighter?.signTransaction) {
    showMessage("Freighter is required to sign transactions.", "error");
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
    return false;
  }
  if (!walletPublicKey || !contractId) {
    showMessage("Connect wallet and set Contract ID.", "error");
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
    return false;
  }
  const server = new Server(RPC_URL, { allowHttp: true });
  const contract = new Contract(String(contractId));
  let account;
  try {
    // Fetch fresh account to get current sequence number
    account = await server.getAccount(walletPublicKey);
    console.log("[invokeContract] account loaded:", account.accountId(), "seq:", account.sequenceNumber());
  } catch (e) {
    showMessage("Account not found on network. Fund it first.", "error");
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
    return false;
  }
  
  let op, tx;
  try {
    op = contract.call(methodName, ...args);
    console.log("[invokeContract] operation created");
    tx = new TransactionBuilder(account, {
      fee: "10000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(180)
      .build();
    console.log("[invokeContract] transaction built, hash:", tx.hash().toString("hex"));
  } catch (e) {
    console.error("[invokeContract] Failed to build transaction:", e);
    showMessage("Failed to build transaction: " + (e?.message || e), "error");
    return false;
  }
  
  let prepared;
  try {
    // Simulate first
    const simulation = await server.simulateTransaction(tx);
    console.log("[invokeContract] simulation result:", simulation);
    console.log("[invokeContract] simulation auth:", simulation.result?.auth);
    
    if (simulation.error) {
      throw new Error(simulation.error);
    }
    
    if (!simulation.transactionData) {
      throw new Error("Simulation did not return transactionData");
    }
    
    // Build the soroban data from simulation
    const sorobanData = simulation.transactionData.build();
    
    // Calculate fee: base fee + resource fee from simulation
    const baseFee = 10000;
    const resourceFee = simulation.minResourceFee ? Number(simulation.minResourceFee) : 0;
    const totalFee = (baseFee + resourceFee).toString();
    
    // Get auth entries from simulation (required for contract calls with require_auth)
    const authEntries = simulation.result?.auth || [];
    console.log("[invokeContract] auth entries count:", authEntries.length);
    console.log("[invokeContract] auth entries:", authEntries);
    if (authEntries.length > 0) {
      console.log("[invokeContract] first auth entry type:", typeof authEntries[0]);
      console.log("[invokeContract] first auth entry:", authEntries[0]);
    }
    
    // Import Operation and xdr to rebuild with auth
    const { Operation, xdr } = await import("@stellar/stellar-sdk");
    
    // Get the original invoke_host_function details from our operation
    const originalOp = op.body().invokeHostFunctionOp();
    const hostFunc = originalOp.hostFunction();
    
    // Parse auth entries - they might be base64 strings or already XDR objects
    const parsedAuth = authEntries.map(a => {
      if (typeof a === 'string') {
        return xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64');
      } else if (a.toXDR) {
        // Already an XDR object
        return a;
      } else {
        console.log("[invokeContract] unknown auth entry format:", a);
        return a;
      }
    });
    console.log("[invokeContract] parsed auth entries:", parsedAuth);
    
    // Create new operation with auth from simulation
    const opWithAuth = Operation.invokeHostFunction({
      func: hostFunc,
      auth: parsedAuth,
    });
    
    // Rebuild transaction with auth-enabled operation + soroban data
    const preparedBuilder = new TransactionBuilder(account, {
      fee: totalFee,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(opWithAuth)
      .setTimeout(180)
      .setSorobanData(sorobanData);
    
    prepared = preparedBuilder.build();
    console.log("[invokeContract] transaction prepared with auth, fee:", totalFee);
  } catch (e) {
    console.error("[invokeContract] Simulation/prepare failed:", e);
    showMessage("Simulation failed: " + (e?.message || e), "error");
    return false;
  }
  
  const xdr = prepared.toXDR();
  let signedXdr;
  try {
    console.log("[invokeContract] calling signTransaction with xdr length:", xdr.length);
    const signResult = await freighter.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE });
    console.log("[invokeContract] sign result type:", typeof signResult);
    console.log("[invokeContract] sign result:", JSON.stringify(signResult, null, 2));
    console.log("[invokeContract] sign result keys:", signResult ? Object.keys(signResult) : "null");
    
    // Freighter may return different formats depending on version
    if (typeof signResult === "string") {
      signedXdr = signResult;
    } else if (signResult?.signedTxXdr) {
      signedXdr = signResult.signedTxXdr;
    } else if (signResult?.xdr) {
      signedXdr = signResult.xdr;
    } else if (signResult?.signedXDR) {
      signedXdr = signResult.signedXDR;
    } else if (signResult?.signed) {
      signedXdr = signResult.signed;
    }
    
    if (!signedXdr || typeof signedXdr !== "string") {
      console.error("[invokeContract] Could not extract XDR from:", signResult);
      throw new Error("No signed XDR returned from Freighter");
    }
    console.log("[invokeContract] transaction signed, xdr length:", signedXdr.length);
  } catch (e) {
    console.error("[invokeContract] Signing failed:", e);
    showMessage("Signing cancelled or failed: " + (e?.message || e), "error");
    return false;
  }
  
  let signedTx;
  try {
    signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
    console.log("[invokeContract] signed tx parsed");
  } catch (e) {
    console.error("[invokeContract] Failed to parse signed XDR:", e);
    showMessage("Failed to parse signed transaction.", "error");
    return false;
  }
  try {
    const sendResult = await server.sendTransaction(signedTx);
    console.log("[invokeContract] transaction sent:", sendResult);
    console.log("[invokeContract] send status:", sendResult.status);
    if (sendResult.errorResult) {
      console.log("[invokeContract] errorResult:", sendResult.errorResult);
      try {
        // Try to get more details from the error
        const errorXdr = sendResult.errorResult.toXDR?.("base64") || sendResult.errorResult;
        console.log("[invokeContract] error XDR:", errorXdr);
        // Try to get result code
        if (sendResult.errorResult._attributes) {
          console.log("[invokeContract] error attributes:", sendResult.errorResult._attributes);
        }
        // Get the result code name
        const resultCode = sendResult.errorResult.result?.()?.switch?.()?.name;
        console.log("[invokeContract] result code:", resultCode);
      } catch (e) {
        console.log("[invokeContract] could not decode error:", e);
      }
    }
    
    // Also log the hash so user can check on explorer
    if (sendResult.hash) {
      console.log("[invokeContract] Check tx on explorer: https://stellar.expert/explorer/testnet/tx/" + sendResult.hash);
    }
    
    if (sendResult.status === "ERROR") {
      // Transaction failed immediately - check for specific error types
      const resultCode = sendResult.errorResult?.result?.()?.switch?.()?.name;
      console.log("[invokeContract] Error result code:", resultCode);
      
      if (resultCode === "txBadSeq") {
        // Sequence error - wait and let the user retry manually
        // The sequence has probably been incremented by a previous tx
        showMessage("Sequence out of sync. Refreshing account - click the button again.", "error");
        // Don't return false yet - let finally block clean up
      } else {
        const errMsg = resultCode || sendResult.errorResult?.toString?.() || "Transaction rejected";
        showMessage("Transaction failed: " + errMsg, "error");
      }
      return false;
    }
    
    if (sendResult.status === "PENDING" || sendResult.status === "TRY_AGAIN_LATER") {
      showMessage(`Transaction submitted, waiting for confirmation...`, "info");
      // Poll for result
      const hash = sendResult.hash;
      let attempts = 0;
      while (attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          const txResult = await server.getTransaction(hash);
          console.log("[invokeContract] poll result:", txResult.status);
          if (txResult.status === "SUCCESS") {
            showMessage(`${methodName} succeeded!`, "success");
            return true;
          } else if (txResult.status === "FAILED") {
            showMessage(`${methodName} failed on-chain.`, "error");
            return false;
          }
        } catch (pollErr) {
          // Not found yet, keep polling
        }
        attempts++;
      }
      showMessage("Transaction timeout - check explorer.", "error");
      return false;
    } else if (sendResult.status === "SUCCESS") {
      showMessage(`${methodName} succeeded!`, "success");
      return true;
    } else {
      showMessage(`Transaction status: ${sendResult.status}`, "error");
      return false;
    }
  } catch (e) {
    console.error("[invokeContract] Send failed:", e);
    showMessage("Send failed: " + (e?.message || e), "error");
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
    return false;
  } finally {
    isInvoking = false;
    buttons.forEach(b => b.disabled = false);
  }
}

async function simulateContract(methodName, args = [], id = contractId) {
  console.log("[DEBUG simulateContract] methodName:", methodName, "id:", id);
  await loadStellarSdk();
  
  let server, contract, account, tx, sim;
  
  try {
    server = new Server(RPC_URL, { allowHttp: true });
    console.log("[DEBUG simulateContract] Server created");
  } catch (err) {
    console.error("[DEBUG simulateContract] Server creation failed:", err);
    throw err;
  }
  
  try {
    contract = new Contract(String(id));
    console.log("[DEBUG simulateContract] Contract created successfully");
  } catch (err) {
    console.error("[DEBUG simulateContract] Contract creation failed:", err?.message || err);
    throw err;
  }
  
  try {
    // Use a valid "zero" public key for simulation (no real signing needed)
    const zeroKey = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    account = new Account(zeroKey, "0");
    console.log("[DEBUG simulateContract] Account created");
  } catch (err) {
    console.error("[DEBUG simulateContract] Account creation failed:", err?.message || err);
    throw err;
  }
  
  try {
    tx = new TransactionBuilder(account, {
      fee: "10000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(methodName, ...args))
      .setTimeout(180)
      .build();
    console.log("[DEBUG simulateContract] Transaction built");
  } catch (err) {
    console.error("[DEBUG simulateContract] Transaction build failed:", err?.message || err);
    throw err;
  }
  
  try {
    sim = await server.simulateTransaction(tx);
    console.log("[DEBUG simulateContract] Simulation result:", sim);
  } catch (err) {
    console.error("[DEBUG simulateContract] Simulation failed:", err?.message || err);
    throw err;
  }
  
  if (sim.error) {
    console.error("[DEBUG simulateContract] Simulation returned error:", sim.error);
    throw new Error(sim.error);
  }
  if (!sim.result?.retval) return undefined;
  return sim.result.retval;
}

// Load escrow state and go to dashboard
async function loadEscrow() {
  const inputEl = document.getElementById("contractId");
  if (!inputEl) return;
  const raw = (inputEl.value ?? "").trim();
  const input = normalizeContractId(raw);
  if (!input) {
    showMessage("Enter a Contract ID (starts with C).", "error");
    return;
  }
  if (!input.startsWith("C")) {
    showMessage("Contract ID must start with C (Stellar contract address).", "error");
    return;
  }
  if (input.length !== 56) {
    showMessage(`Contract ID must be 56 characters (got ${input.length}). Paste the full ID with no spaces.`, "error");
    return;
  }
  const resolvedId = tryResolveContractId(input);
  if (!resolvedId) {
    showMessage(
      "Contract ID checksum failed. Paste the exact 56-character ID again (avoid mixing digit 1 with letter I, or 0 with O).",
      "error"
    );
    return;
  }
  if (resolvedId !== input) {
    showMessage("We corrected 1→I or 0→O in your ID. Loading…", "success");
  }
  contractId = resolvedId;
  try {
    // Try to get state first - if contract exists but no escrow created, this will fail
    let state = null;
    let buyer = "—";
    let seller = "—";
    let amount = "—";
    let evidence = "—";
    let notInitialized = false;

    try {
      const stateResult = await simulateContract("get_state", [], resolvedId);
      // Convert ScVal to native JS value
      const stateNative = stateResult ? scValToNative(stateResult) : null;
      state = typeof stateNative === 'number' ? stateNative : (stateNative?.value ?? null);
      console.log("[loadEscrow] state result:", stateResult, "native:", stateNative, "final:", state);
    } catch (stateErr) {
      const stateMsg = stateErr?.message ?? "";
      if (stateMsg.includes("not initialized") || stateMsg.includes("UnreachableCodeReached") || stateMsg.includes("InvalidAction")) {
        notInitialized = true;
      } else {
        throw stateErr; // Re-throw if it's a different error
      }
    }

    if (!notInitialized && state !== null) {
      // Escrow exists, fetch other details
      const results = await Promise.allSettled([
        simulateContract("get_buyer", [], resolvedId),
        simulateContract("get_seller", [], resolvedId),
        simulateContract("get_amount", [], resolvedId),
        simulateContract("get_evidence", [], resolvedId),
      ]);
      
      // Convert ScVal results to native values
      if (results[0].status === "fulfilled" && results[0].value) {
        const buyerNative = scValToNative(results[0].value);
        buyer = typeof buyerNative === 'string' ? buyerNative : (buyerNative?.toString?.() ?? "—");
      }
      if (results[1].status === "fulfilled" && results[1].value) {
        const sellerNative = scValToNative(results[1].value);
        seller = typeof sellerNative === 'string' ? sellerNative : (sellerNative?.toString?.() ?? "—");
      }
      if (results[2].status === "fulfilled" && results[2].value) {
        const amountNative = scValToNative(results[2].value);
        amount = String(amountNative);
      }
      if (results[3].status === "fulfilled" && results[3].value) {
        const evidenceNative = scValToNative(results[3].value);
        evidence = typeof evidenceNative === 'string' ? evidenceNative : (evidenceNative?.toString?.() ?? "—");
      }
      
      console.log("[loadEscrow] parsed values:", { state, buyer, seller, amount, evidence });
    }

    setEl("stateValue", notInitialized ? "Not initialized" : (state != null ? STATE_NAMES[state] ?? state : "—"));
    setEl("buyerValue", buyer);
    setEl("sellerValue", seller);
    setEl("amountValue", amount);
    setEl("evidenceValue", evidence);
    setContractDisplay();

    if (notInitialized) {
      showMessage("Contract found but no escrow created yet. Use the form below to create one.", "info");
    } else {
      showMessage("Escrow loaded.", "success");
    }
    goToStep(3);
  } catch (e) {
    console.error("[DEBUG loadEscrow] Catch block error:", e);
    const msg = e?.message ?? String(e);
    console.error("[DEBUG loadEscrow] Error message:", msg);
    if (msg.includes("checksum") || msg.includes("Invalid contract ID")) {
      const len = (contractId || "").length;
      let hint;
      if (len !== 56) {
        hint = `You pasted ${len} characters; the full contract ID is 56. Copy the full "Contract ID" from Stellar Expert (not the shortened display).`;
      } else {
        hint = "Invalid checksum. Stellar IDs use only letters A–Z and digits 2–7 (no 0, 1, 8, 9). If you see 1 or 0, try letter I or O instead and paste again.";
      }
      showMessage(hint, "error");
    } else {
      showMessage("Load failed: " + msg, "error");
    }
  }
}

async function createEscrow() {
  const sellerInput = document.getElementById("sellerInput").value?.trim();
  const amountInput = document.getElementById("amountInput").value?.trim();
  let tokenInput = document.getElementById("tokenInput").value?.trim();
  
  // Default to testnet XLM token if empty
  if (!tokenInput) {
    tokenInput = TESTNET_XLM_TOKEN;
    document.getElementById("tokenInput").value = TESTNET_XLM_TOKEN;
  }
  
  if (!sellerInput || !amountInput) {
    showMessage("Fill seller address and amount.", "error");
    return;
  }
  
  // Validate addresses
  if (!StrKey.isValidEd25519PublicKey(sellerInput) && !StrKey.isValidContract(sellerInput)) {
    showMessage("Invalid seller address. Use G... (account) or C... (contract).", "error");
    return;
  }
  if (!StrKey.isValidContract(tokenInput)) {
    showMessage("Invalid token contract. Must start with C and be 56 characters.", "error");
    return;
  }
  
  const amountNum = BigInt(amountInput);
  if (amountNum <= 0n) {
    showMessage("Amount must be a positive number.", "error");
    return;
  }
  
  // Convert all arguments to ScVal for Soroban
  const buyerScVal = new Address(walletPublicKey).toScVal();
  const sellerScVal = new Address(sellerInput).toScVal();
  const amountScVal = nativeToScVal(amountNum, { type: "i128" });
  const tokenScVal = new Address(tokenInput).toScVal();
  
  console.log("[createEscrow] ScVal args:", { buyerScVal, sellerScVal, amountScVal, tokenScVal });
  
  const success = await invokeContract("create", [buyerScVal, sellerScVal, amountScVal, tokenScVal]);
  if (success) {
    // Reload escrow state after successful creation
    await loadEscrow();
  }
}

async function fundEscrow() {
  const success = await invokeContract("fund", []);
  if (success) await loadEscrow();
}

async function markShipped() {
  const evidence = document.getElementById("evidenceInput").value?.trim() || "Shipped";
  // Convert string to ScVal
  const evidenceScVal = nativeToScVal(evidence, { type: "string" });
  const success = await invokeContract("mark_shipped", [evidenceScVal]);
  if (success) await loadEscrow();
}

async function confirmDelivery() {
  const success = await invokeContract("confirm_delivery", []);
  if (success) await loadEscrow();
}

function bindButtons() {
  document.getElementById("connectBtn").addEventListener("click", connectWallet);
  document.getElementById("backToWelcomeBtn").addEventListener("click", backToWelcome);
  document.getElementById("loadBtn").addEventListener("click", loadEscrow);
  document.getElementById("differentContractBtn").addEventListener("click", differentContract);
  document.getElementById("createBtn").addEventListener("click", createEscrow);
  document.getElementById("fundBtn").addEventListener("click", fundEscrow);
  document.getElementById("markShippedBtn").addEventListener("click", markShipped);
  document.getElementById("confirmBtn").addEventListener("click", confirmDelivery);
}

bindButtons();
