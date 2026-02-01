/**
 * Lumenswags UI — 3-step flow: Welcome → Connect → Contract → Dashboard
 * Freighter + Stellar testnet (Gateway RPC).
 * Run: npm install && npm run dev (SDK is bundled; no CDN/CORS).
 */

import { Server } from "@stellar/stellar-sdk/rpc";
import { Contract, TransactionBuilder, Keypair, StrKey, Account } from "@stellar/stellar-sdk";

// Use proxy path in dev (Vite proxies /rpc → Stellar testnet RPC to bypass CORS)
const RPC_URL = "/rpc";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

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
async function invokeContract(methodName, args = []) {
  await loadStellarSdk();
  const freighter = getFreighter();
  if (!freighter?.signTransaction) {
    showMessage("Freighter is required to sign transactions.", "error");
    return;
  }
  if (!walletPublicKey || !contractId) {
    showMessage("Connect wallet and set Contract ID.", "error");
    return;
  }
  const server = new Server(RPC_URL, { allowHttp: true });
  const contract = new Contract(String(contractId));
  let account;
  try {
    account = await server.getAccount(walletPublicKey);
  } catch (e) {
    showMessage("Account not found on network. Fund it first.", "error");
    return;
  }
  const op = contract.call(methodName, ...args);
  const tx = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(180)
    .build();
  let prepared;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (e) {
    showMessage("Simulation failed: " + (e?.message || e), "error");
    return;
  }
  const xdr = prepared.toXDR();
  let signedXdr;
  try {
    signedXdr = await freighter.signTransaction(xdr, NETWORK_PASSPHRASE);
  } catch (e) {
    showMessage("Signing cancelled or failed.", "error");
    return;
  }
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  try {
    await server.sendTransaction(signedTx);
    showMessage(`Transaction submitted: ${methodName}`, "success");
  } catch (e) {
    showMessage("Send failed: " + (e?.message || e), "error");
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
      state = await simulateContract("get_state", [], resolvedId).then((v) => (v !== undefined ? Number(v) : null));
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
      buyer = results[0].status === "fulfilled" ? (results[0].value?.toString?.() ?? String(results[0].value)) : "—";
      seller = results[1].status === "fulfilled" ? (results[1].value?.toString?.() ?? String(results[1].value)) : "—";
      amount = results[2].status === "fulfilled" ? String(results[2].value) : "—";
      evidence = results[3].status === "fulfilled" ? String(results[3].value) : "—";
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
  const seller = document.getElementById("sellerInput").value?.trim();
  const amount = document.getElementById("amountInput").value?.trim();
  const token = document.getElementById("tokenInput").value?.trim();
  if (!seller || !amount || !token) {
    showMessage("Fill seller, amount, and token address.", "error");
    return;
  }
  await invokeContract("create", [walletPublicKey, seller, amount, token]);
  setTimeout(() => loadEscrow(), 2000);
}

async function fundEscrow() {
  await invokeContract("fund");
  setTimeout(() => loadEscrow(), 2000);
}

async function markShipped() {
  const evidence = document.getElementById("evidenceInput").value?.trim() || "Shipped";
  await invokeContract("mark_shipped", [evidence]);
  setTimeout(() => loadEscrow(), 2000);
}

async function confirmDelivery() {
  await invokeContract("confirm_delivery");
  setTimeout(() => loadEscrow(), 2000);
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
