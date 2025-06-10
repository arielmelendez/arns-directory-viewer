import { ARIO, ANT, AOProcess, ARIO_MAINNET_PROCESS_ID } from "@ar.io/sdk";
import { connect } from "@permaweb/aoconnect";

// Default settings
const DEFAULT_CU_URL = "https://cu.ardrive.io";
const DEFAULT_GATEWAY_URL = "https://arweave.net"; // Using SDK defaults

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
          MODE: 'legacy',
          CU_URL: cuUrl || DEFAULT_CU_URL,
          GRAPHQL_URL: `${gatewayUrl}/graphql`,
          GATEWAY_URL: gatewayUrl,
        })
      })
    });
    const record = await ario.getArNSRecord({ name: arnsName });
    console.log(`ArNS Record: ${JSON.stringify(record, null, 2)}`);

    if (!record || !record.processId) {
      statusEl.textContent = `No ANT found for ArNS name "${arnsName}".`;
      return;
    }

    const ant = ANT.init({
      process: new AOProcess({
        processId: record.processId,
        ao: connect({
          MODE: 'legacy',
          CU_URL: cuUrl || DEFAULT_CU_URL,
          GRAPHQL_URL: `${gatewayUrl}/graphql`,
          GATEWAY_URL: gatewayUrl,
        }),
      }),
    });
    
    const antRecords = await ant.getRecords();
    console.log(`ANT Records: ${JSON.stringify(antRecords, null, 2)}`);

    // Display the ANT records
    statusEl.textContent = `ANT Records for "${arnsName}":`;
    statusEl.className = "";

    const table = document.createElement("table");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML =
      "<th>Undername</th><th>Transaction ID</th><th>Click to Copy</th><th>TTL Secs</th>";
    table.appendChild(headerRow);

    for (const [undername, antRecord] of Object.entries(antRecords)) {
      const row = document.createElement("tr");

      // Create undername link
      const undernameLink = document.createElement("a");
      console.log(`Full gateway url: ${fullGatewayUrl}; Protocol: ${protocol}; Undername: ${undername}; ArNS Name: ${arnsName}`);
      undernameLink.href = undername === "@" ? `${protocol}//${arnsName}.${fullGatewayUrl.replace(`${protocol}//`, "")}` : `${protocol}//${undername}_${arnsName}.${fullGatewayUrl.replace(`${protocol}//`, "")}`;
      undernameLink.textContent = undername;
      undernameLink.style.wordBreak = "break-all";
      undernameLink.target = "_blank";
      undernameLink.rel = "noopener noreferrer";

      // Create clickable transactionId link
      const txLink = document.createElement("a");
      txLink.href = `${fullGatewayUrl}/${antRecord.transactionId}`;
      txLink.textContent = antRecord.transactionId;
      txLink.style.wordBreak = "break-all";
      txLink.target = "_blank";
      txLink.rel = "noopener noreferrer";

      // Create copy emoji button
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "📋";
      copyBtn.title = "Copy Transaction ID";
      copyBtn.style.cursor = "pointer";
      copyBtn.style.display = "block";
      copyBtn.style.margin = "0 auto";
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(antRecord.transactionId);
          copyBtn.textContent = "✅";
          setTimeout(() => (copyBtn.textContent = "📋"), 1000);
        } catch {
          copyBtn.textContent = "❌";
          setTimeout(() => (copyBtn.textContent = "📋"), 1000);
        }
      };

      row.innerHTML = `<td></td><td></td><td></td>`;
      row.children[0].appendChild(undernameLink);
      row.children[1].appendChild(txLink);
      row.children[2].appendChild(copyBtn);
      row.innerHTML += `<td>${antRecord.ttlSeconds}</td>`;

      table.appendChild(row);
    }

    recordsEl.appendChild(table);
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
