// Data Management
const storageKey = 'kitTrackProData'; // Keeping key same to preserve existing data if any
let currentRole = null;
let pendingRole = null; // Temp store for login flow
let selectedKitId = null;
let filteredReportsCache = [];

const loadData = () => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { kits: [], shiftReports: [], transfers: [] };
  try { return JSON.parse(raw); } catch (e) { return { kits: [], shiftReports: [], transfers: [] }; }
};

const saveData = (data) => {
  localStorage.setItem(storageKey, JSON.stringify(data));
};

const state = loadData();

// Helpers
const fmtDateTime = (d) => {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleString();
};

const fmtDate = (d) => {
  if (!d) return '-';
  const date = new Date(d);
  return date.toISOString().slice(0,10);
};

const openModal = (id) => {
  document.getElementById(id).classList.add('active');
};

const closeModal = (id) => {
  document.getElementById(id).classList.remove('active');
  if (id === 'passwordModal') {
    document.getElementById('rolePassword').value = '';
    pendingRole = null;
  }
};

// Render Sidebar
const renderSidebar = () => {
  const kitList = document.getElementById('kitList');
  kitList.innerHTML = '';
  
  const activeKits = state.kits.filter(k => k.status === 'OPEN');

  if (!activeKits.length) {
    kitList.innerHTML = '<div class="text-sm text-slate-500">No active kits.</div>';
    return;
  }
  activeKits.forEach(kit => {
    const card = document.createElement('div');
    // Highlight if selected
    card.className = `p-3 rounded-lg border cursor-pointer transition ${kit.id === selectedKitId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-200'}`;
    card.innerHTML = `
      <div class="flex justify-between text-sm font-semibold text-slate-900">${kit.id}<span class="text-xs px-2 py-1 rounded-full ${kit.status==='OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}">${kit.status}</span></div>
      <div class="text-xs text-slate-500">Model: ${kit.model}</div>
      <div class="text-xs text-slate-500">Remaining: ${kit.remainingQty}</div>
      <div class="text-xs text-slate-500">Line: ${kit.issuedLine}</div> 
    `;
    card.onclick = () => { selectedKitId = kit.id; renderKitDetail(); renderSidebar(); };
    kitList.appendChild(card);
  });
};

// Render Closed Kits
const renderClosedKits = () => {
  const container = document.getElementById('closedKitList');
  if (!container) return;
  
  const closedKits = state.kits.filter(k => k.status === 'CLOSED');
  container.innerHTML = '';
  
  if (!closedKits.length) {
    container.innerHTML = '<p class="text-sm text-slate-500">No closed kits.</p>';
    return;
  }

  closedKits.forEach(kit => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center p-3 bg-slate-50 border border-slate-200 rounded-lg';
    item.innerHTML = `
      <div>
        <div class="font-semibold text-sm text-slate-900">${kit.id} - ${kit.model}</div>
        <div class="text-xs text-slate-500">Closed on: ${kit.closeDate ? fmtDate(kit.closeDate) : 'N/A'}</div>
      </div>
      <div class="flex gap-2">
         <button class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700" onclick="viewClosedKitData('${kit.id}')">View</button>
         <button class="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700" onclick="downloadKitExcel('${kit.id}')">Download</button>
      </div>
    `;
    container.appendChild(item);
  });
};

// View Closed Kit Data (On Screen)
window.viewClosedKitData = (kitId) => {
  const kit = state.kits.find(k => k.id === kitId);
  const reports = state.shiftReports.filter(r => r.kitId === kitId);
  
  let msg = `Kit: ${kit.id}\nModel: ${kit.model}\nTotal Qty: ${kit.totalQty}\nStatus: CLOSED\n\nHistory:\n`;
  if(reports.length === 0) msg += "No entries found.";
  
  reports.forEach(r => {
      msg += `${fmtDate(r.date)} | Line: ${r.line} | Used: ${r.quantityUsed} | Packed: ${r.output} | Rej: ${r.rejection}\n`;
  });
  
  alert(msg); // Using alert for simplicity as requested, keeping logic clean.
};

// Download Excel
window.downloadKitExcel = (kitId) => {
  const kit = state.kits.find(k => k.id === kitId);
  const reports = state.shiftReports.filter(r => r.kitId === kitId);
  
  let csvContent = "data:text/csv;charset=utf-8,";
  // Added Total Quantity to Excel Header
  csvContent += `Kit ID,${kitId}\nModel,${kit.model}\nTotal Quantity,${kit.totalQty}\nStatus,CLOSED\n\n`;
  csvContent += "Date,Line,Leader,Input Used,Output (Packed),Rejection,Semi-FG,Remarks,Remaining After\n";
  
  reports.forEach(r => {
    csvContent += `${fmtDate(r.date)},${r.line},${r.leader},${r.quantityUsed},${r.output},${r.rejection},${r.semi || 0},${r.remarks || ''},${r.remainingAfter}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Closed_Kit_${kitId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Render Kit Detail
const renderKitDetail = () => {
  const container = document.getElementById('kitDetailContent');
  if (!selectedKitId) {
    container.innerHTML = '<div class="text-slate-500">Select a kit from the sidebar to view details.</div>';
    return;
  }
  const kit = state.kits.find(k => k.id === selectedKitId);
  if (!kit) {
    container.innerHTML = '<div class="text-slate-500">Kit not found.</div>';
    return;
  }
  
  const history = state.shiftReports.filter(r => r.kitId === kit.id);
  const totalUsed = kit.totalQty - kit.remainingQty;
  const totalRejection = history.reduce((sum, r) => sum + (Number(r.rejection) || 0), 0);

  // Manager can VIEW, Data Incharge can TRANSFER/CLOSE
  const canTransfer = currentRole === 'Data Incharge' && kit.status === 'OPEN';
  const canClose = currentRole === 'Data Incharge' && kit.status === 'OPEN' && kit.remainingQty === 0;
  
  container.innerHTML = `
    <div class="flex justify-between items-start gap-4">
      <div>
        <div class="text-lg font-semibold text-slate-900">Kit ${kit.id}</div>
        <p class="text-sm text-slate-500">Model: ${kit.model}</p>
        <p class="text-sm text-slate-500">Issued Line: ${kit.issuedLine}</p>
        <p class="text-sm text-slate-500">Issue Date: ${fmtDateTime(kit.issueDate)}</p>
      </div>
      <div class="flex gap-2">
        ${canTransfer ? '<button id="transferBtn" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Transfer Remaining Kit</button>' : ''}
        ${canClose ? '<button id="closeKitBtn" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900">Close Kit</button>' : ''}
      </div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Total Quantity</p>
        <p class="text-lg font-semibold text-slate-900">${kit.totalQty}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Total Used</p>
        <p class="text-lg font-semibold text-slate-900">${totalUsed}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Packed Quantity</p>
        <p class="text-lg font-semibold text-emerald-700">${kit.packedQty || 0}</p>
      </div>
       <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Total Rejection</p>
        <p class="text-lg font-semibold text-red-600">${totalRejection}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Remaining Quantity</p>
        <p class="text-lg font-semibold text-slate-900">${kit.remainingQty}</p>
      </div>
      <div class="p-3 rounded-lg bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500">Pending Semi-FG</p>
        <p class="text-lg font-semibold text-orange-600">${kit.semiQty || 0}</p>
      </div>
    </div>

    <div class="mt-6">
      <h4 class="text-sm font-semibold text-slate-900 mb-2">Daily History</h4>
      <div class="overflow-x-auto border border-slate-200 rounded-lg">
        <table class="min-w-full text-xs text-left">
          <thead class="bg-slate-50 font-medium text-slate-700">
            <tr>
              <th class="px-3 py-2 border-b">Date</th>
              <th class="px-3 py-2 border-b">Line</th>
              <th class="px-3 py-2 border-b">Input</th>
              <th class="px-3 py-2 border-b">Packed</th>
              <th class="px-3 py-2 border-b">Rej</th>
              <th class="px-3 py-2 border-b">Semi</th>
              <th class="px-3 py-2 border-b">Remarks</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${history.length === 0 ? '<tr><td colspan="7" class="px-3 py-2 text-center text-slate-500">No entries yet.</td></tr>' : 
              history.map(h => `
                <tr>
                  <td class="px-3 py-2 text-slate-900">${fmtDate(h.date)}</td>
                  <td class="px-3 py-2 text-slate-500">${h.line}</td>
                  <td class="px-3 py-2 text-slate-900">${h.quantityUsed}</td>
                  <td class="px-3 py-2 text-emerald-700 font-medium">${h.output}</td>
                  <td class="px-3 py-2 text-red-600">${h.rejection}</td>
                  <td class="px-3 py-2 text-orange-600">${h.semi || 0}</td>
                  <td class="px-3 py-2 text-slate-500">${h.remarks || '-'}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  if (canTransfer) {
    document.getElementById('transferBtn').onclick = () => openTransferModal(kit);
  }
  if (canClose) {
    document.getElementById('closeKitBtn').onclick = () => closeKit(kit.id);
  }
};

const openTransferModal = (kit) => {
  document.getElementById('transferKitId').value = kit.id;
  document.getElementById('transferModel').value = kit.model;
  document.getElementById('transferFrom').value = kit.issuedLine;
  document.getElementById('transferTo').value = '';
  document.getElementById('transferQty').value = kit.remainingQty;
  openModal('transferModal');
};

const closeKit = (kitId) => {
  const kit = state.kits.find(k => k.id === kitId);
  if (!kit) return;
  if (kit.remainingQty !== 0) return;
  
  kit.status = 'CLOSED';
  kit.closeDate = new Date().toISOString();
  
  saveData(state);
  renderSidebar();
  renderClosedKits();
  renderKitDetail();
  renderLineLeaderKitOptions();
  renderManagerStats();
};

// Line Leader Dropdown
const renderLineLeaderKitOptions = () => {
  const select = document.getElementById('kitSelect');
  if (!select) return;
  select.innerHTML = '';
  const openKits = state.kits.filter(k => k.status === 'OPEN' && k.remainingQty > 0);
  if (!openKits.length) {
    select.innerHTML = '<option value="">No open kits available</option>';
    return;
  }
  select.innerHTML = '<option value="">Select Kit</option>' + openKits.map(k => `<option value="${k.id}">${k.id} - ${k.model} (Remaining: ${k.remainingQty})</option>`).join('');
};

// Manager Stats
const renderManagerStats = () => {
  // Lifetime stats
  const totalProduction = state.shiftReports.reduce((sum, r) => sum + Number(r.quantityUsed || 0), 0);
  const activeKits = state.kits.filter(k => k.status === 'OPEN').length;
  const closedKits = state.kits.filter(k => k.status === 'CLOSED').length;
  
  document.getElementById('totalProduction').textContent = totalProduction;
  document.getElementById('activeKits').textContent = activeKits;
  document.getElementById('closedKits').textContent = closedKits;

  // Today's Stats Calculation
  const todayStr = new Date().toISOString().slice(0,10);
  const todayReports = state.shiftReports.filter(r => fmtDate(r.date) === todayStr);

  const tInput = todayReports.reduce((sum, r) => sum + (Number(r.quantityUsed)||0), 0);
  const tPacked = todayReports.reduce((sum, r) => sum + (Number(r.output)||0), 0);
  const tRejection = todayReports.reduce((sum, r) => sum + (Number(r.rejection)||0), 0);
  const tSemi = todayReports.reduce((sum, r) => sum + (Number(r.semi)||0), 0);

  document.getElementById('todayInput').textContent = tInput;
  document.getElementById('todayPacked').textContent = tPacked;
  document.getElementById('todayRejection').textContent = tRejection;
  document.getElementById('todaySemi').textContent = tSemi;
};

// Reports Table
const renderReportsTable = (rows = state.shiftReports) => {
  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-3 py-3 text-center text-slate-500">No records found.</td></tr>';
    return;
  }
  
  // Sort by date desc
  const sorted = [...rows].sort((a,b) => new Date(b.date) - new Date(a.date));

  sorted.forEach((r, index) => {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';
    
    // Action Buttons for Data Incharge
    let actions = '-';
    if (currentRole === 'Data Incharge') {
      // Finding actual index in state array to delete/edit correctly
      const actualIndex = state.shiftReports.indexOf(r);
      actions = `
        <button onclick="deleteReport(${actualIndex})" class="text-xs text-red-600 hover:underline">Delete</button>
      `;
    }

    tr.innerHTML = `
      <td class="px-3 py-2">${fmtDate(r.date)}</td>
      <td class="px-3 py-2">${r.line}</td>
      <td class="px-3 py-2">${r.leader}</td>
      <td class="px-3 py-2">${r.kitId}</td>
      <td class="px-3 py-2">${r.model}</td>
      <td class="px-3 py-2">${r.quantityUsed}</td>
      <td class="px-3 py-2">${r.remainingAfter}</td>
      <td class="px-3 py-2">${actions}</td>
    `;
    tbody.appendChild(tr);
  });
  filteredReportsCache = sorted;
};

// Delete Report (Data Incharge Only)
window.deleteReport = (index) => {
  if (!confirm('Are you sure you want to delete this record? This will adjust the kit quantity back.')) return;
  
  const report = state.shiftReports[index];
  const kit = state.kits.find(k => k.id === report.kitId);
  
  if (kit && kit.status === 'OPEN') {
      // Revert calculations
      const deducted = Number(report.output) + Number(report.rejection);
      kit.remainingQty += deducted;
      kit.packedQty = (kit.packedQty || 0) - Number(report.output);
      kit.semiQty = (kit.semiQty || 0) - Number(report.semi || 0);
  } else {
      alert('Warning: Associated kit is Closed or missing. Quantity cannot be automatically restored.');
  }
  
  state.shiftReports.splice(index, 1);
  saveData(state);
  renderReportsTable();
  renderSidebar();
  renderKitDetail();
  renderManagerStats();
};

// Login Handling
const showMain = () => {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('header').style.display = 'block';
  document.getElementById('mainLayout').classList.remove('hidden');
  document.getElementById('currentRoleDisplay').textContent = currentRole;
  
  // View Visibility Logic
  // Data Incharge: Sees Kit Management (w/ Add), Closed Kits
  // Manager: Sees Kit Management (No Add), Closed Kits, Dashboard
  // Line Leader: Sees Shift Entry
  
  const kitMgmt = document.getElementById('kitManagementView');
  const addBtn = document.getElementById('addKitBtn');
  const lineView = document.getElementById('lineLeaderView');
  const mgrView = document.getElementById('managerView');

  kitMgmt.classList.add('hidden');
  lineView.classList.add('hidden');
  mgrView.classList.add('hidden');
  addBtn.classList.add('hidden');

  if (currentRole === 'Line Leader') {
      lineView.classList.remove('hidden');
  } else if (currentRole === 'Data Incharge') {
      kitMgmt.classList.remove('hidden');
      addBtn.classList.remove('hidden');
      // Data Incharge also sees reports table inside manager view? Or should we duplicate?
      // Re-using manager view for reports table specifically is easiest or create shared.
      // Current req says "Data Incharge must have full permissions...". 
      // I will show the Manager View (Reports part) to Data Incharge too so they can edit.
      mgrView.classList.remove('hidden'); 
  } else if (currentRole === 'Manager') {
      kitMgmt.classList.remove('hidden');
      mgrView.classList.remove('hidden');
  }

  renderSidebar();
  renderClosedKits();
  renderKitDetail();
  renderLineLeaderKitOptions();
  renderManagerStats();
  renderReportsTable();
};

// Password Logic
document.querySelectorAll('.roleBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const role = btn.dataset.role;
    if (role === 'Line Leader') {
      currentRole = role;
      showMain();
    } else {
      pendingRole = role;
      openModal('passwordModal');
    }
  });
});

document.getElementById('confirmLoginBtn').addEventListener('click', () => {
    const pwd = document.getElementById('rolePassword').value;
    if (pendingRole === 'Data Incharge' && pwd === '1089') {
        currentRole = pendingRole;
        closeModal('passwordModal');
        showMain();
    } else if (pendingRole === 'Manager' && pwd === '1088') {
        currentRole = pendingRole;
        closeModal('passwordModal');
        showMain();
    } else {
        alert('Incorrect Password');
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  currentRole = null;
  selectedKitId = null;
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('header').style.display = 'none';
  document.getElementById('mainLayout').classList.add('hidden');
});

// Add Kit
document.getElementById('addKitBtn').addEventListener('click', () => openModal('addKitModal'));
document.getElementById('addKitForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('kitIdInput').value.trim();
  const model = document.getElementById('modelInput').value.trim();
  const totalQty = Number(document.getElementById('totalQtyInput').value);
  const issuedLine = document.getElementById('issuedLineInput').value;
  if (!id || !model || !totalQty || !issuedLine) return;
  if (state.kits.find(k => k.id === id)) {
    alert('Kit ID already exists.');
    return;
  }
  const kit = {
    id,
    model,
    totalQty,
    remainingQty: totalQty,
    semiQty: 0,
    packedQty: 0,
    issuedLine,
    issueDate: new Date().toISOString(),
    status: 'OPEN',
    activeLines: [issuedLine],
    transfers: []
  };
  state.kits.push(kit);
  saveData(state);
  closeModal('addKitModal');
  document.getElementById('addKitForm').reset();
  selectedKitId = kit.id;
  renderSidebar();
  renderKitDetail();
  renderLineLeaderKitOptions();
  renderManagerStats();
});

// Transfer
document.getElementById('transferForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const kitId = document.getElementById('transferKitId').value;
  const toLine = document.getElementById('transferTo').value;
  const qty = Number(document.getElementById('transferQty').value);
  const kit = state.kits.find(k => k.id === kitId);
  if (!kit || kit.status !== 'OPEN') return;
  if (!toLine) return;
  if (qty < 0 || qty > kit.remainingQty) {
    alert('Transfer quantity must be between 0 and remaining quantity.');
    return;
  }
  
  // LOGIC CHANGE: Visibly affect system
  const fromLine = kit.issuedLine;
  kit.issuedLine = toLine; // Update the main issued line
  
  // Track active lines
  if (!kit.activeLines.includes(toLine)) kit.activeLines.push(toLine);
  
  // Record Transfer
  state.transfers.push({ kitId, model: kit.model, fromLine, toLine, qty, date: new Date().toISOString() });
  
  saveData(state);
  closeModal('transferModal');
  renderSidebar(); // Sidebar will now show new Line
  renderKitDetail(); // Detail view updates
  alert(`Successfully transferred Kit ${kitId} to ${toLine}`);
});

// Shift Submission
document.getElementById('shiftForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const line = document.getElementById('lineSelect').value;
  const leader = document.getElementById('leaderName').value.trim();
  const kitId = document.getElementById('kitSelect').value;
  const inputUsed = Number(document.getElementById('inputUsed').value);
  const output = Number(document.getElementById('outputQty').value);
  const rejection = Number(document.getElementById('rejectionQty').value);
  const semi = Number(document.getElementById('semiQty').value);
  const remarks = document.getElementById('remarksInput').value.trim();
  
  const message = document.getElementById('shiftMessage');
  message.textContent = '';
  message.className = 'text-sm font-medium';
  if (!line || !leader || !kitId) return;
  
  if (output + rejection + semi !== inputUsed) {
    message.textContent = 'Validation failed: Output + Rejection + Semi-FG must equal Input Used.';
    message.classList.add('text-red-600');
    return;
  }
  
  const kit = state.kits.find(k => k.id === kitId && k.status === 'OPEN');
  if (!kit) {
    message.textContent = 'Selected kit unavailable.';
    message.classList.add('text-red-600');
    return;
  }
  if (inputUsed > kit.remainingQty) {
    message.textContent = 'Input Used exceeds remaining quantity.';
    message.classList.add('text-red-600');
    return;
  }
  
  const deductedQty = output + rejection;
  kit.remainingQty -= deductedQty;
  kit.semiQty = (kit.semiQty || 0) + semi;
  kit.packedQty = (kit.packedQty || 0) + output;

  if (!kit.activeLines.includes(line)) kit.activeLines.push(line);
  
  const report = {
    date: new Date().toISOString(),
    line,
    leader,
    kitId,
    model: kit.model,
    quantityUsed: inputUsed,
    output,
    rejection,
    semi,
    remarks,
    remainingAfter: kit.remainingQty
  };
  state.shiftReports.push(report);
  saveData(state);
  
  message.textContent = 'Shift entry saved successfully.';
  message.classList.add('text-emerald-600');
  document.getElementById('shiftForm').reset();
  
  renderSidebar();
  renderKitDetail();
  renderLineLeaderKitOptions();
  renderManagerStats();
  renderReportsTable();
});

// Filters
document.getElementById('applyFilter').addEventListener('click', () => {
  const dateVal = document.getElementById('filterDate').value;
  const lineVal = document.getElementById('filterLine').value;
  let rows = state.shiftReports;
  if (dateVal) rows = rows.filter(r => fmtDate(r.date) === dateVal);
  if (lineVal) rows = rows.filter(r => r.line === lineVal);
  renderReportsTable(rows);
});

// Export CSV
document.getElementById('exportCsv').addEventListener('click', () => {
  const rows = filteredReportsCache.length ? filteredReportsCache : state.shiftReports;
  if (!rows.length) return;
  const header = ['Date','Line','Line Leader Name','Kit ID','Model','Quantity Used','Remaining Quantity', 'Semi-FG', 'Remarks'];
  const csvRows = [header.join(',')];
  rows.forEach(r => {
    csvRows.push([fmtDate(r.date), r.line, r.leader, r.kitId, r.model, r.quantityUsed, r.remainingAfter, r.semi || 0, r.remarks || ''].join(','));
  });
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kittrack_pro.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Initial render
renderSidebar();
renderClosedKits();
renderLineLeaderKitOptions();
renderManagerStats();
renderReportsTable();