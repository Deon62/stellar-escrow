/**
 * Lumenswags UI — 3-step flow: Welcome → Connect → Contract → Dashboard
 * Freighter + Stellar testnet (Gateway RPC).
 */

const RPC_URL = "https://soroban-rpc.testnet.stellar.gateway.fm";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const STATE_NAMES = { 0: "Created", 1: "Funded", 2: "Shipped", 3: "Released" };

let walletPublicKey = null;
let contractId = null;
let Server, Contract, TransactionBuilder, Keypair;

async function loadStellarSdk() {
  if (Server) return;
  const sdk = await import("https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@14.2.1/+esm");
  Server = sdk.SorobanRpc.Server;
  Contract = sdk.Contract;
  TransactionBuilder = sdk.TransactionBuilder;
  Keypair = sdk.Keypair;
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
  const freighter = getFreighter();
  if (!freighter) {
    showMessage("Freighter not detected. Load the page over HTTP (e.g. Live Server) and ensure the Freighter extension is installed and enabled for this site.", "error");
    return;
  }
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
    document.getElementById("connectBtn").textContent = "Connected";
    document.getElementById("connectBtn").disabled = true;
    showMessage("Wallet connected.", "success");
    goToStep(2);
  } catch (e) {
    showMessage(e?.message || "Could not connect wallet.", "error");
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
  const server = new Server(RPC_URL);
  const contract = new Contract(contractId);
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
  const StellarSdk = await import("https://cdn.jsdelivr.net/npm/@stellar/stellar-sdk@14.2.1/+esm");
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  try {
    await server.sendTransaction(signedTx);
    showMessage(`Transaction submitted: ${methodName}`, "success");
  } catch (e) {
    showMessage("Send failed: " + (e?.message || e), "error");
  }
}

async function simulateContract(methodName, args = []) {
  await loadStellarSdk();
  const server = new Server(RPC_URL);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(
    Keypair.fromPublicKey("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACH").account(),
    {
      fee: "10000",
      networkPassphrase: NETWORK_PASSPHRASE,
    }
  )
    .addOperation(contract.call(methodName, ...args))
    .setTimeout(180)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (sim.error) throw new Error(sim.error);
  if (!sim.result?.retval) return undefined;
  return sim.result.retval;
}

// Load escrow state and go to dashboard
async function loadEscrow() {
  const input = document.getElementById("contractId").value?.trim();
  if (!input) {
    showMessage("Enter a Contract ID (C...).", "error");
    return;
  }
  contractId = input;
  try {
    const [state, buyer, seller, amount, evidence] = await Promise.all([
      simulateContract("get_state").then((v) => (v !== undefined ? Number(v) : null)),
      simulateContract("get_buyer").then((addr) => addr?.toString?.() ?? String(addr)),
      simulateContract("get_seller").then((addr) => addr?.toString?.() ?? String(addr)),
      simulateContract("get_amount").then((v) => (v !== undefined ? String(v) : null)),
      simulateContract("get_evidence")
        .catch(() => null)
        .then((v) => (v !== undefined && v != null ? String(v) : "—")),
    ]);
    setEl("stateValue", state != null ? STATE_NAMES[state] ?? state : "—");
    setEl("buyerValue", buyer ?? "—");
    setEl("sellerValue", seller ?? "—");
    setEl("amountValue", amount ?? "—");
    setEl("evidenceValue", evidence ?? "—");
    setContractDisplay();
    showMessage("Escrow loaded.", "success");
    goToStep(3);
  } catch (e) {
    showMessage("Load failed: " + (e?.message || e), "error");
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
