/* 
    PRIME X SYSTEM LOGIC
    Updated Strictly for Sohail
*/

// --- STATE MANAGEMENT ---
let kits = JSON.parse(localStorage.getItem('primeXKits')) || [];
let productionLogs = JSON.parse(localStorage.getItem('primeXLogs')) || [];
let currentUserRole = '';

// --- DOM LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        location.reload();
    });

    // --- BUTTON EVENT LISTENERS ---
    // Add Kit (Only for Data Incharge)
    const addKitBtn = document.getElementById('addKitBtn');
    if(addKitBtn) addKitBtn.addEventListener('click', () => document.getElementById('addKitModal').classList.remove('hidden'));
    
    document.getElementById('closeAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('cancelAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('addKitForm').addEventListener('submit', handleAddKit);

    // Transfer Kit
    document.getElementById('closeTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('cancelTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('transferForm').addEventListener('submit', handleTransferKit);

    // Line Leader Shift Form
    document.getElementById('shiftForm').addEventListener('submit', handleShiftEntry);

    // Manager Filters
    document.getElementById('applyFilter').addEventListener('click', updateManagerDashboard);

    // Search Inputs
    document.getElementById('kitSearch').addEventListener('keyup', renderSidebarKits);
    document.getElementById('closedKitSearch').addEventListener('keyup', renderClosedKits);
});

// --- LOGIN ---
function login(role) {
    currentUserRole = role;
    
    // Hide Login, Show Main
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('mainLayout').classList.remove('hidden');
    
    document.getElementById('currentRoleDisplay').innerText = role;
    setupViewByRole();
}

function setupViewByRole() {
    const role = currentUserRole;

    // Reset Views
    document.getElementById('kitManagementView').classList.add('hidden');
    document.getElementById('lineLeaderView').classList.add('hidden');
    document.getElementById('managerView').classList.add('hidden');
    
    // Hide Add Kit Button by default, show only if Data Incharge
    document.getElementById('addKitBtn').classList.add('hidden');

    if (role === 'Data Incharge') {
        document.getElementById('kitManagementView').classList.remove('hidden');
        document.getElementById('addKitBtn').classList.remove('hidden'); // Show Permission
        renderSidebarKits();
        renderClosedKits();
    } else if (role === 'Line Leader') {
        document.getElementById('lineLeaderView').classList.remove('hidden');
        updateKitSelectDropdown(); 
    } else if (role === 'Manager') {
        document.getElementById('managerView').classList.remove('hidden');
        document.getElementById('kitManagementView').classList.remove('hidden'); 
        renderSidebarKits();
        renderClosedKits();
        document.getElementById('filterDate').valueAsDate = new Date();
        updateManagerDashboard();
    }
}

// --- KIT MANAGEMENT ---
function handleAddKit(e) {
    e.preventDefault();
    if(currentUserRole !== 'Data Incharge') return; // Strict Check

    const newKit = {
        id: document.getElementById('kitIdInput').value.toUpperCase(),
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value),
        line: document.getElementById('issuedLineInput').value,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value),
        
        packedQty: 0,
        rejectionQty: 0,
        semiQty: 0,
        
        status: 'Active', 
        isTransferred: false,
        createdDate: new Date().toISOString().split('T')[0],
        logs: []
    };

    kits.push(newKit);
    saveData();
    document.getElementById('addKitModal').classList.add('hidden');
    e.target.reset();
    
    renderSidebarKits();
    if(currentUserRole === 'Manager') updateManagerDashboard();
}

// --- RENDER SIDEBAR ---
function renderSidebarKits() {
    const list = document.getElementById('kitList');
    const searchTerm = document.getElementById('kitSearch').value.toLowerCase();
    
    list.innerHTML = '';
    const activeKits = kits.filter(k => k.status === 'Active');
    const filteredKits = activeKits.filter(k => 
        k.id.toLowerCase().includes(searchTerm) || 
        k.model.toLowerCase().includes(searchTerm) ||
        k.line.toLowerCase().includes(searchTerm)
    );

    if (filteredKits.length === 0) {
        list.innerHTML = '<div class="text-slate-500 text-sm text-center p-4">No active kits.</div>';
        return;
    }

    filteredKits.forEach(kit => {
        const div = document.createElement('div');
        const transferClass = kit.isTransferred ? 'is-transferred' : '';
        const badgeHTML = kit.isTransferred ? '<div class="transferred-badge">TRANSFERRED</div>' : '';

        div.className = `kit-item ${transferClass}`;
        div.innerHTML = `
            ${badgeHTML}
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-bold text-sm text-slate-800">${kit.id}</div>
                    <div class="text-xs text-slate-500">${kit.model}</div>
                </div>
                <div class="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">${kit.line}</div>
            </div>
            <div class="mt-2 flex justify-between text-xs text-slate-500">
                <span>Total: ${kit.totalQty}</span>
                <span>Rem: <b class="text-slate-800">${kit.remainingQty}</b></span>
            </div>
        `;
        // Fix for "Clicking bug": This is cleaner
        div.onclick = () => showKitDetails(kit.id);
        list.appendChild(div);
    });
}

// --- FULL A-Z DETAILS ---
function showKitDetails(kitId) {
    const kit = kits.find(k => k.id === kitId);
    if (!kit) return;

    // Fix: We target the Card directly to ensure DOM consistency
    const card = document.getElementById('kitDetailCard');
    
    const historyLogs = productionLogs.filter(log => log.kitId === kit.id);
    
    let logsHTML = '<div class="overflow-auto max-h-40 border border-slate-200 rounded mt-2"><table class="w-full text-xs text-left"><thead class="bg-slate-50"><tr><th class="p-2">Date</th><th class="p-2">Line</th><th class="p-2">Used</th><th class="p-2">Output</th><th class="p-2">Rej</th></tr></thead><tbody>';
    
    if(historyLogs.length > 0) {
        historyLogs.reverse().forEach(log => {
            logsHTML += `
                <tr class="border-t border-slate-100">
                    <td class="p-2 text-slate-600">${log.date}</td>
                    <td class="p-2 text-slate-600">${log.line}</td>
                    <td class="p-2 text-slate-600">${log.input || '-'}</td>
                    <td class="p-2 text-green-600 font-bold">${log.output || '-'}</td>
                    <td class="p-2 text-red-600">${log.rejection || '-'}</td>
                </tr>`;
        });
    } else {
        logsHTML += '<tr><td colspan="5" class="p-2 text-center text-slate-400">No production logs yet.</td></tr>';
    }
    logsHTML += '</tbody></table></div>';

    // PERMISSIONS LOGIC
    let actionsHTML = '';
    
    if(currentUserRole === 'Data Incharge') {
        if(kit.status === 'Active') {
            actionsHTML = `
                <div class="mt-6 flex gap-3 border-t border-slate-100 pt-4">
                    <button onclick="openTransferModal('${kit.id}')" class="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-sm font-semibold transition shadow-sm">
                        Transfer Kit
                    </button>
                    <button onclick="closeKit('${kit.id}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded text-sm font-semibold transition shadow-sm">
                        Close Kit
                    </button>
                </div>
            `;
        } else if (kit.status === 'Closed') {
            // Reopen Button for Closed Kits
            actionsHTML = `
                <div class="mt-6 border-t border-slate-100 pt-4">
                    <button onclick="reopenKit('${kit.id}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-semibold transition shadow-sm">
                        <i class="fas fa-undo"></i> Reopen Kit (Make Active)
                    </button>
                </div>
            `;
        }
    }

    const transferBanner = kit.isTransferred ? 
        `<div class="bg-orange-50 border border-orange-200 text-orange-800 p-2 rounded mb-4 text-sm text-center font-bold">
            <i class="fas fa-info-circle"></i> This Kit has been Transferred
         </div>` : '';

    // RENDER
    card.innerHTML = `
        ${transferBanner}
        <div class="flex justify-between items-start mb-4">
            <div>
                <h3 class="text-3xl font-bold text-slate-900">${kit.id}</h3>
                <p class="text-slate-500 text-lg">${kit.model}</p>
            </div>
            <div class="text-right">
                <span class="bg-slate-800 text-white px-3 py-1 rounded text-sm font-bold">${kit.line}</span>
                <p class="text-xs text-slate-400 mt-2">Status: <span class="${kit.status==='Active'?'text-blue-600 font-bold':'text-red-600 font-bold'}">${kit.status}</span></p>
            </div>
        </div>
        
        <div class="grid grid-cols-4 gap-4 mb-6 text-center">
            <div class="bg-slate-50 p-3 rounded border border-slate-200">
                <p class="text-xs text-slate-500 uppercase">Total Input</p>
                <p class="text-xl font-bold text-slate-800">${kit.totalQty}</p>
            </div>
            <div class="bg-green-50 p-3 rounded border border-green-100">
                <p class="text-xs text-green-600 uppercase">Packed</p>
                <p class="text-xl font-bold text-green-700">${kit.packedQty || 0}</p>
            </div>
            <div class="bg-red-50 p-3 rounded border border-red-100">
                <p class="text-xs text-red-600 uppercase">Rejection</p>
                <p class="text-xl font-bold text-red-700">${kit.rejectionQty || 0}</p>
            </div>
            <div class="bg-blue-50 p-3 rounded border border-blue-100">
                <p class="text-xs text-blue-600 uppercase">Remaining</p>
                <p class="text-xl font-bold text-blue-700">${kit.remainingQty}</p>
            </div>
        </div>

        <div>
            <h4 class="text-sm font-bold text-slate-700">Production History (A-Z)</h4>
            ${logsHTML}
        </div>

        ${actionsHTML}
    `;
}

// --- CLOSED KITS SECTION ---
function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const searchTerm = document.getElementById('closedKitSearch').value.toLowerCase();
    
    list.innerHTML = '';
    const closedKits = kits.filter(k => k.status === 'Closed');
    const filtered = closedKits.filter(k => 
        k.id.toLowerCase().includes(searchTerm) || 
        k.model.toLowerCase().includes(searchTerm)
    );

    if(filtered.length === 0) {
        list.innerHTML = '<p class="text-sm text-slate-500 italic">No closed kits found.</p>';
        return;
    }

    filtered.forEach(kit => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-200 hover:bg-slate-100 cursor-pointer transition';
        div.innerHTML = `
            <div>
                <span class="font-bold text-slate-700">${kit.id}</span>
                <span class="text-xs text-slate-500 ml-2">${kit.model}</span>
            </div>
            <div class="text-right">
               <div class="text-xs font-bold text-green-600">Packed: ${kit.packedQty || 0}</div>
               <div class="text-[10px] text-red-500 font-bold">CLOSED</div>
            </div>
        `;
        div.onclick = () => showKitDetails(kit.id);
        list.appendChild(div);
    });
}

function exportClosedKits() {
    const closedKits = kits.filter(k => k.status === 'Closed');
    if(closedKits.length === 0) {
        alert("No closed kits data to export.");
        return;
    }
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Kit ID,Model,Line,Created Date,Total Input,Packed Qty,Rejection Qty,Semi FG,Remaining Qty\n";
    closedKits.forEach(k => {
        const row = [
            k.id, k.model, k.line, k.createdDate, k.totalQty, k.packedQty || 0, k.rejectionQty || 0, k.semiQty || 0, k.remainingQty
        ].join(",");
        csvContent += row + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "PRIME_X_Closed_Kits.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- ACTIONS (Close / Reopen / Transfer) ---
function closeKit(kitId) {
    if(!confirm('Are you sure you want to close this kit?')) return;
    const kit = kits.find(k => k.id === kitId);
    if(kit) {
        kit.status = 'Closed';
        saveData();
        renderSidebarKits();
        renderClosedKits();
        showKitDetails(kitId); // Refresh details to show Reopen button
    }
}

// NEW: Reopen Kit Functionality
function reopenKit(kitId) {
    if(!confirm('Reopen this kit and make it Active?')) return;
    const kit = kits.find(k => k.id === kitId);
    if(kit) {
        kit.status = 'Active';
        saveData();
        renderSidebarKits();
        renderClosedKits();
        showKitDetails(kitId); // Refresh details to show Close/Transfer buttons
    }
}

function openTransferModal(kitId) {
    const kit = kits.find(k => k.id === kitId);
    if(!kit) return;
    document.getElementById('transferKitId').value = kit.id;
    document.getElementById('transferFrom').value = kit.line;
    document.getElementById('transferQty').value = kit.remainingQty;
    document.getElementById('transferModal').classList.remove('hidden');
}

function handleTransferKit(e) {
    e.preventDefault();
    const kitId = document.getElementById('transferKitId').value;
    const newLine = document.getElementById('transferTo').value;
    const qty = parseInt(document.getElementById('transferQty').value);
    
    const kit = kits.find(k => k.id === kitId);
    
    if(kit && qty > 0 && qty <= kit.remainingQty) {
        kit.line = newLine;
        kit.isTransferred = true; 
        
        productionLogs.push({
            date: new Date().toISOString().split('T')[0],
            line: newLine,
            leader: 'System Transfer',
            kitId: kit.id,
            model: kit.model,
            input: 0, output: 0, rejection: 0,
            type: 'Transfer'
        });

        saveData();
        document.getElementById('transferModal').classList.add('hidden');
        renderSidebarKits();
        showKitDetails(kitId); 
        alert('Kit Transferred Successfully');
    } else {
        alert('Invalid Quantity');
    }
}

// --- LINE LEADER ENTRY ---
function updateKitSelectDropdown() {
    const select = document.getElementById('kitSelect');
    select.innerHTML = '<option value="">Select Active Kit</option>';
    
    const active = kits.filter(k => k.status === 'Active');
    if(active.length === 0) {
        select.innerHTML = '<option value="">No Active Kits Available</option>';
    }
    active.forEach(k => {
        select.innerHTML += `<option value="${k.id}">${k.id} - ${k.model} (${k.line})</option>`;
    });
}

function handleShiftEntry(e) {
    e.preventDefault();
    const kitId = document.getElementById('kitSelect').value;
    if(!kitId) { alert("Please select a kit"); return; }

    const inputUsed = parseInt(document.getElementById('inputUsed').value);
    const output = parseInt(document.getElementById('outputQty').value);
    const rejection = parseInt(document.getElementById('rejectionQty').value);
    const semi = parseInt(document.getElementById('semiQty').value);
    const line = document.getElementById('lineSelect').value;
    const leader = document.getElementById('leaderName').value;

    const kit = kits.find(k => k.id === kitId);
    
    if(kit) {
        if(inputUsed > kit.remainingQty) {
            alert('Error: Input used cannot exceed remaining quantity!');
            return;
        }

        kit.remainingQty -= inputUsed;
        kit.packedQty = (kit.packedQty || 0) + output;
        kit.rejectionQty = (kit.rejectionQty || 0) + rejection;
        kit.semiQty = (kit.semiQty || 0) + semi;

        productionLogs.push({
            date: new Date().toISOString().split('T')[0],
            line: line,
            leader: leader,
            kitId: kit.id,
            model: kit.model,
            input: inputUsed,
            output: output,
            rejection: rejection,
            semi: semi,
            remarks: document.getElementById('remarksInput').value
        });
        
        saveData();
        
        document.getElementById('shiftMessage').innerText = "Entry Saved Successfully!";
        setTimeout(() => document.getElementById('shiftMessage').innerText = "", 3000);
        e.target.reset();
        updateKitSelectDropdown();
    }
}

// --- MANAGER OVERVIEW ---
function updateManagerDashboard() {
    const filterDate = document.getElementById('filterDate').value; 
    const filterLine = document.getElementById('filterLine').value;

    const filteredLogs = productionLogs.filter(log => {
        const dateMatch = filterDate ? log.date === filterDate : true;
        const lineMatch = filterLine === 'All' ? true : log.line === filterLine;
        return dateMatch && lineMatch;
    });

    let totalInput = 0, totalPacked = 0, totalRejection = 0, totalSemi = 0;

    filteredLogs.forEach(log => {
        totalInput += (log.input || 0);
        totalPacked += (log.output || 0);
        totalRejection += (log.rejection || 0);
        totalSemi += (log.semi || 0);
    });

    let totalActivities = totalPacked + totalRejection;
    const closedCount = kits.filter(k => k.status === 'Closed' && (filterLine === 'All' || k.line === filterLine)).length;
    let eff = totalInput > 0 ? ((totalPacked / totalInput) * 100).toFixed(1) : 0;

    document.getElementById('statInput').innerText = totalInput;
    document.getElementById('statPacked').innerText = totalPacked;
    document.getElementById('statRejection').innerText = totalRejection;
    document.getElementById('statSemi').innerText = totalSemi;
    document.getElementById('statActivities').innerText = totalActivities;
    document.getElementById('statClosed').innerText = closedCount;
    document.getElementById('statEfficiency').innerText = eff + '%';

    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    
    if(filteredLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-slate-400">No logs found.</td></tr>';
    } else {
        filteredLogs.forEach(log => {
            const row = `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="px-4 py-3">${log.date}</td>
                    <td class="px-4 py-3"><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded">${log.line}</span></td>
                    <td class="px-4 py-3">${log.leader}</td>
                    <td class="px-4 py-3 font-semibold text-slate-700">${log.kitId}</td>
                    <td class="px-4 py-3 text-slate-500">${log.model}</td>
                    <td class="px-4 py-3 text-right">${log.input || 0}</td>
                    <td class="px-4 py-3 text-right text-green-600 font-bold">${log.output || 0}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    }
}

function saveData() {
    localStorage.setItem('primeXKits', JSON.stringify(kits));
    localStorage.setItem('primeXLogs', JSON.stringify(productionLogs));
}