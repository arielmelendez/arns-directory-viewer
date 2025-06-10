import { ARIO, ANT, AOProcess, ARIO_MAINNET_PROCESS_ID } from "@ar.io/sdk";
import { connect } from "@permaweb/aoconnect";

// Default settings
const DEFAULT_CU_URL = "https://cu.ardrive.io";
const DEFAULT_GATEWAY_URL = "https://arweave.net"; // Using SDK defaults

let originalRecords = [];
let currentFilterText = "";
let currentFilterField = "under_name";
let currentSortField = null;
let currentSortDir = null;

// Function to get ArNS name from hostname or use fallback
function getArNsNameFromHostname() {
  const hostname = window.location.hostname; // e.g., "my.page.site"
  let parts = hostname.split(".");
  if (parts.length < 3) {
    parts = ["ardrive", "ar", "io"]; // Fallback for testing
  }
  const subdomain = parts[0]; // "my"

  // Parse the base-level ArNS name
  const arnsParts = subdomain.split("_");
  return arnsParts[arnsParts.length - 1];
}

function getGatewayUrlFromHostname() {
  // Return everything before the deepest subdomain
  const hostname = window.location.hostname; // e.g., "my.page.site"
  const parts = hostname.split(".");
  if (parts.length < 3) {
    return DEFAULT_GATEWAY_URL; // Fallback if not enough parts
  }
  // Join all parts except the first one
  return parts.slice(1).join(".");
}

function applyFilter(records) {
  if (!currentFilterText) return records;
  const t = currentFilterText.toLowerCase();
  return records.filter((r) => {
    const under = r.under_name.toLowerCase();
    const tx = r.transactionId.toLowerCase();
    const ttl = String(r.ttlSeconds).toLowerCase();
    switch (currentFilterField) {
      case "under_name":
        return under.includes(t);
      case "txid":
        return tx.includes(t);
      case "ttl":
        return ttl.includes(t);
      case "all":
        return under.includes(t) || tx.includes(t) || ttl.includes(t);
      default:
        return true;
    }
  });
}

function sortRecords(records) {
  if (!currentSortField) return [...records];
  const sorted = [...records].sort((a, b) => {
    let av = a[currentSortField];
    let bv = b[currentSortField];
    if (currentSortField === "ttlSeconds") {
      av = Number(av);
      bv = Number(bv);
    } else {
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
    }
    if (av > bv) return 1;
    if (av < bv) return -1;
    return 0;
  });
  return currentSortDir === "desc" ? sorted.reverse() : sorted;
}

function updateRecordCount(total, shown) {
  const countEl = document.getElementById("recordCount");
  if (!countEl) return;
  let text = `Total Records: ${total}`;
  if (currentFilterText) {
    text += ` (${shown} shown)`;
  }
  countEl.textContent = text;
}

function getSortIndicator(field) {
  if (currentSortField !== field) return "";
  return currentSortDir === "desc" ? " \u25BC" : " \u25B2"; // ▼ or ▲
}

function buildTable(recordsEl) {
  const table = document.createElement("table");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML =
    `<th data-field="under_name">Under_name${getSortIndicator("under_name")}</th>` +
    `<th data-field="transactionId">Transaction ID${getSortIndicator("transactionId")}</th>` +
    `<th>Click to Copy</th>` +
    `<th data-field="ttlSeconds">TTL Secs${getSortIndicator("ttlSeconds")}</th>`;
  table.appendChild(headerRow);

  headerRow.querySelectorAll("th[data-field]").forEach((th) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      if (currentSortField === field) {
        if (currentSortDir === "asc") currentSortDir = "desc";
        else if (currentSortDir === "desc") {
          currentSortField = null;
          currentSortDir = null;
        } else currentSortDir = "asc";
      } else {
        currentSortField = field;
        currentSortDir = "asc";
      }
      renderTable();
    });
  });

  const displayRecords = applyFilter(sortRecords(originalRecords));
  updateRecordCount(originalRecords.length, displayRecords.length);

  if (displayRecords.length === 0) {
    recordsEl.appendChild(table);
    return;
  }

  for (const rec of displayRecords) {
    const row = document.createElement("tr");

    const underLink = document.createElement("a");
    underLink.href = rec.href;
    underLink.textContent = rec.under_name;
    underLink.style.wordBreak = "break-all";
    underLink.target = "_blank";
    underLink.rel = "noopener noreferrer";

    const txLink = document.createElement("a");
    txLink.href = rec.txHref;
    txLink.textContent = rec.transactionId;
    txLink.style.wordBreak = "break-all";
    txLink.target = "_blank";
    txLink.rel = "noopener noreferrer";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋";
    copyBtn.title = "Copy Transaction ID";
    copyBtn.style.cursor = "pointer";
    copyBtn.style.display = "block";
    copyBtn.style.margin = "0 auto";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(rec.transactionId);
        copyBtn.textContent = "✅";
        setTimeout(() => (copyBtn.textContent = "📋"), 1000);
      } catch {
        copyBtn.textContent = "❌";
        setTimeout(() => (copyBtn.textContent = "📋"), 1000);
      }
    });

    row.innerHTML = `<td></td><td></td><td></td>`;
    row.children[0].appendChild(underLink);
    row.children[1].appendChild(txLink);
    row.children[2].appendChild(copyBtn);
    row.innerHTML += `<td>${rec.ttlSeconds}</td>`;

    table.appendChild(row);
  }

  recordsEl.appendChild(table);
}

function renderTable() {
  const recordsEl = document.getElementById("records");
  recordsEl.innerHTML = "";
  buildTable(recordsEl);
}

// Main function to fetch and display ANT records
async function fetchAndDisplayRecords(arnsName, gatewayUrl, cuUrl, protocol) {
  const statusEl = document.getElementById("status");
  const recordsEl = document.getElementById("records");
  
  // Clear previous results
  recordsEl.innerHTML = "";
  statusEl.textContent = "Loading ANT records...";
  statusEl.className = "loading";

  try {
    // Initialize the ar.io SDK with optional gateway override
    gatewayUrl = gatewayUrl ? gatewayUrl : DEFAULT_GATEWAY_URL;

    // Ensure gatewayUrl includes protocol
    let fullGatewayUrl = gatewayUrl;
    if (!/^https?:\/\//i.test(gatewayUrl)) {
      fullGatewayUrl = `${window.location.protocol}//${gatewayUrl}`;
    }

    const ario = ARIO.mainnet({
      process: new AOProcess({
        processId: ARIO_MAINNET_PROCESS_ID,
        ao: connect({
          MODE: "legacy",
          CU_URL: cuUrl || DEFAULT_CU_URL,
          GRAPHQL_URL: `${gatewayUrl}/graphql`,
          GATEWAY_URL: gatewayUrl,
        }),
      }),
    });
    const record = await ario.getArNSRecord({ name: arnsName });
    console.log(`ArNS Record: ${JSON.stringify(record, null, 2)}`);

    if (!record || !record.processId) {
      statusEl.textContent = `No ANT found for ArNS name "${arnsName}".`;
      updateRecordCount(0, 0);
      return;
    }

    const ant = ANT.init({
      process: new AOProcess({
        processId: record.processId,
        ao: connect({
          MODE: "legacy",
          CU_URL: cuUrl || DEFAULT_CU_URL,
          GRAPHQL_URL: `${gatewayUrl}/graphql`,
          GATEWAY_URL: gatewayUrl,
        }),
      }),
    });

    const antRecords = await ant.getRecords();
    console.log(`ANT Records: ${JSON.stringify(antRecords, null, 2)}`);

    originalRecords = Object.entries(antRecords).map(([undername, rec]) => ({
      under_name: undername,
      transactionId: rec.transactionId,
      ttlSeconds: rec.ttlSeconds,
      href:
        undername === "@"
          ? `${protocol}//${arnsName}.${fullGatewayUrl.replace(`${protocol}//`, "")}`
          : `${protocol}//${undername}_${arnsName}.${fullGatewayUrl.replace(`${protocol}//`, "")}`,
      txHref: `${fullGatewayUrl}/${rec.transactionId}`,
    }));

    statusEl.textContent = `ANT Records for "${arnsName}":`;
    statusEl.className = "";
    renderTable();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Error loading ANT records.";
  }
}

// Initialize the page
function initialize() {
  // Get default ArNS name from hostname
  const defaultArnsName = getArNsNameFromHostname();
  const defaultGatewayUrl = getGatewayUrlFromHostname();
  const defaultProtocol = defaultGatewayUrl.match(/^(https?:)\/\//)?.[1] || window.location.protocol;
  
  // Set up input fields
  const arnsNameInput = document.getElementById("arnsName");
  const gatewayUrlInput = document.getElementById("gatewayUrl");
  const cuUrlInput = document.getElementById("cuUrl");
  const applyButton = document.getElementById("applySettings");
  const restoreDefaultsButton = document.getElementById("restoreDefaults");
  const filterInput = document.getElementById("filterInput");
  const filterFieldSelect = document.getElementById("filterField");

  updateRecordCount(0, 0);
  
  // Set initial value for ArNS name
  arnsNameInput.value = defaultArnsName;
  
  // Default CU URL value
  cuUrlInput.value = DEFAULT_CU_URL;

  // Set initial value for gateway URL
  gatewayUrlInput.value = defaultGatewayUrl;
  
  // Apply button handler
  applyButton.addEventListener("click", () => {
    gatewayUrlInput.value = gatewayUrlInput.value.trim() || defaultGatewayUrl;
    const newGatewayUrl = gatewayUrlInput.value;
    // Extract the protocol from the new gateway URL OR fallback to default protocol
    const newProtocol = newGatewayUrl.match(/^(https?:)\/\//)?.[1] ?? defaultProtocol;
    fetchAndDisplayRecords(
      arnsNameInput.value.trim(),
      newGatewayUrl,
      cuUrlInput.value.trim() || null,
      newProtocol,
    );
  });

  filterInput.addEventListener("input", () => {
    currentFilterText = filterInput.value;
    renderTable();
  });

  filterFieldSelect.addEventListener("change", () => {
    currentFilterField = filterFieldSelect.value;
    renderTable();
  });
  
  // Restore defaults button handler
  restoreDefaultsButton.addEventListener("click", () => {
    arnsNameInput.value = defaultArnsName;
    gatewayUrlInput.value = defaultGatewayUrl;
    cuUrlInput.value = DEFAULT_CU_URL;
    fetchAndDisplayRecords(arnsNameInput.value, gatewayUrlInput.value, cuUrlInput.value, defaultProtocol);
  });
  
  // Initial load
  fetchAndDisplayRecords(defaultArnsName, defaultGatewayUrl, DEFAULT_CU_URL, defaultProtocol);
}

// Start the application
document.addEventListener("DOMContentLoaded", initialize);
