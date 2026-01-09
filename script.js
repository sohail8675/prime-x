/* 
    PRIME X SYSTEM - FINAL STABLE BUILD
    Developer: Sohail
*/

// --- 1. GLOBAL VARIABLES ---
let kits = JSON.parse(localStorage.getItem('primeXKits')) || [];
let productionLogs = JSON.parse(localStorage.getItem('primeXLogs')) || [];
let currentUserRole = '';

// --- 2. CORE LOGIN FUNCTION (Defined first for stability) ---
function login(role) {
    console.log("Logging in as:", role); // Debug for mobile
    currentUserRole = role;
    
    // Hide Login, Show Main App
    const loginSection = document.getElementById('loginSection');
    const header = document.getElementById('header');
    const mainLayout = document.getElementById('mainLayout');
    
    if(loginSection) loginSection.classList.add('hidden');
    if(header) header.classList.remove('hidden');
    if(mainLayout) mainLayout.classList.remove('hidden');
    
    // Update Display Name
    const roleDisplay = document.getElementById('currentRoleDisplay');
    if(roleDisplay) roleDisplay.innerText = role;
    
    setupViewByRole();
}

// --- 3. VIEW CONTROLLER ---
function setupViewByRole() {
    const role = currentUserRole;

    // Reset All Views
    document.getElementById('kitManagementView').classList.add('hidden');
    document.getElementById('lineLeaderView').classList.add('hidden');
    document.getElementById('managerView').classList.add('hidden');
    
    const addBtn = document.getElementById('addKitBtn');
    if(addBtn) addBtn.classList.add('hidden');

    if (role === 'Data Incharge') {
        document.getElementById('kitManagementView').classList.remove('hidden');
        if(addBtn) addBtn.classList.remove('hidden'); // Only Data Incharge sees this
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

// --- 4. EVENT LISTENERS (Wait for DOM) ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => location.reload());

    // Add Kit Logic
    const addKitBtn = document.getElementById('addKitBtn');
    if(addKitBtn) addKitBtn.addEventListener('click', () => document.getElementById('addKitModal').classList.remove('hidden'));
    
    document.getElementById('closeAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('cancelAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('addKitForm').addEventListener('submit', handleAddKit);

    // Transfer Logic
    document.getElementById('closeTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('cancelTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('transferForm').addEventListener('submit', handleTransferKit);

    // Shift Entry
    document.getElementById('shiftForm').addEventListener('submit', handleShiftEntry);

    // Manager
    document.getElementById('applyFilter').addEventListener('click', updateManagerDashboard);

    // Search
    document.getElementById('kitSearch').addEventListener('keyup', renderSidebarKits);
    document.getElementById('closedKitSearch').addEventListener('keyup', renderClosedKits);
});

// --- 5. DATA FUNCTIONS ---

function handleAddKit(e) {
    e.preventDefault();
    if(currentUserRole !== 'Data Incharge') return;

    const newId = document.getElementById('kitIdInput').value.toUpperCase().trim();

    // Prevent Duplicates
    if(kits.some(k => k.id === newId)) {
        alert(`Error: Kit ID "${newId}" already exists!`);
        return;
    }

    const newKit = {
        id: newId,
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value),
        line: document.getElementById('issuedLineInput').value,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value),
        packedQty: 0, rejectionQty: 0, semiQty: 0,
        status: 'Active', isTransferred: false,
        createdDate: new Date().toISOString().split('T')[0],
        logs: []
    };

    kits.push(newKit);
    saveData();
    document.getElementById('addKitModal').classList.add('hidden');
    e.target.reset();
    renderSidebarKits();
    alert("Kit Added!");
}

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
            <div class="flex justify-between items-start pointer-events-none">
                <div>
                    <div class="font-bold text-sm text-slate-800">${kit.id}</div>
                    <div class="text-xs text-slate-500">${kit.model}</div>
                </div>
                <div class="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">${kit.line}</div>
            </div>
            <div class="mt-2 flex justify-between text-xs text-slate-500 pointer-events-none">
                <span>Total: ${kit.totalQty}</span>
                <span>Rem: <b class="text-slate-800">${kit.remainingQty}</b></span>
            </div>
        `;
        div.onclick = function() { showKitDetails(kit.id); };
        list.appendChild(div);
    });
}

function showKitDetails(kitId) {
    const kit = kits.find(k => k.id === kitId);
    if (!kit) return;

    const card = document.getElementById('kitDetailCard');
    const historyLogs = productionLogs.filter(log => log.kitId === kit.id);
    
    let logsHTML = '<div class="overflow-auto max-h-40 border border-slate-200 rounded mt-2"><table class="w-full text-xs text-left"><thead class="bg-slate-50"><tr><th class="p-2">Date</th><th class="p-2">Line</th><th class="p-2">Out</th><th class="p-2">Rej</th></tr></thead><tbody>';
    
    if(historyLogs.length > 0) {
        historyLogs.reverse().forEach(log => {
            logsHTML += `<tr class="border-t border-slate-100"><td class="p-2 text-slate-600">${log.date}</td><td class="p-2">${log.line}</td><td class="p-2 text-green-600 font-bold">${log.output || 0}</td><td class="p-2 text-red-600">${log.rejection || 0}</td></tr>`;
        });
    } else {
        logsHTML += '<tr><td colspan="4" class="p-2 text-center text-slate-400">No logs.</td></tr>';
    }
    logsHTML += '</tbody></table></div>';

    let actionsHTML = '';
    
    // Only Data Incharge sees actions
    if(currentUserRole === 'Data Incharge') {
        if(kit.status === 'Active') {
            actionsHTML = `
                <div class="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                    <button onclick="openTransferModal('${kit.id}')" class="flex-1 bg-orange-500 text-white py-2 rounded text-sm font-semibold">Transfer</button>
                    <button onclick="closeKit('${kit.id}')" class="flex-1 bg-red-600 text-white py-2 rounded text-sm font-semibold">Close</button>
                    <button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button>
                </div>`;
        } else {
            actionsHTML = `
                <div class="mt-4 border-t border-slate-100 pt-4 flex gap-2">
                    <button onclick="reopenKit('${kit.id}')" class="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold">Reopen</button>
                    <button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button>
                </div>`;
        }
    }

    const transferBanner = kit.isTransferred ? `<div class="bg-orange-50 border border-orange-200 text-orange-800 p-2 rounded mb-2 text-xs font-bold">TRANSFERRED</div>` : '';

    card.innerHTML = `
        ${transferBanner}
        <div class="flex justify-between items-center mb-4">
            <div><h3 class="text-2xl font-bold text-slate-900">${kit.id}</h3><p class="text-slate-500 text-sm">${kit.model}</p></div>
            <div class="text-right"><span class="bg-slate-800 text-white px-2 py-1 rounded text-xs">${kit.line}</span><p class="text-xs mt-1 ${kit.status==='Active'?'text-blue-600':'text-red-600'} font-bold">${kit.status}</p></div>
        </div>
        <div class="grid grid-cols-4 gap-2 mb-4 text-center">
            <div class="bg-slate-50 p-2 rounded border"><p class="text-[10px] uppercase text-slate-500">Input</p><p class="font-bold">${kit.totalQty}</p></div>
            <div class="bg-green-50 p-2 rounded border border-green-100"><p class="text-[10px] uppercase text-green-600">Pack</p><p class="font-bold text-green-700">${kit.packedQty||0}</p></div>
            <div class="bg-red-50 p-2 rounded border border-red-100"><p class="text-[10px] uppercase text-red-600">Rej</p><p class="font-bold text-red-700">${kit.rejectionQty||0}</p></div>
            <div class="bg-blue-50 p-2 rounded border border-blue-100"><p class="text-[10px] uppercase text-blue-600">Rem</p><p class="font-bold text-blue-700">${kit.remainingQty}</p></div>
        </div>
        ${logsHTML}
        ${actionsHTML}
    `;
}

function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const searchTerm = document.getElementById('closedKitSearch').value.toLowerCase();
    list.innerHTML = '';
    
    const closedKits = kits.filter(k => k.status === 'Closed').filter(k => 
        k.id.toLowerCase().includes(searchTerm) || k.model.toLowerCase().includes(searchTerm)
    );

    if(closedKits.length === 0) { list.innerHTML = '<p class="text-sm text-slate-500 italic">No closed kits.</p>'; return; }

    closedKits.forEach(kit => {
        const div = document.createElement('div');
        div.className = 'flex justify-between p-3 bg-slate-50 border border-slate-200 rounded mb-2 cursor-pointer';
        div.innerHTML = `<div><div class="font-bold text-sm">${kit.id}</div><div class="text-xs text-slate-500">${kit.model}</div></div><div class="text-xs text-red-500 font-bold">CLOSED</div>`;
        div.onclick = function() { showKitDetails(kit.id); };
        list.appendChild(div);
    });
}

function exportClosedKits() {
    const closed = kits.filter(k => k.status === 'Closed');
    if(closed.length === 0) { alert("No data"); return; }
    let csv = "Kit ID,Model,Line,Date,Input,Packed,Reject,Semi,Remain\n";
    closed.forEach(k => { csv += `${k.id},${k.model},${k.line},${k.createdDate},${k.totalQty},${k.packedQty},${k.rejectionQty},${k.semiQty},${k.remainingQty}\n`; });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "Closed_Kits.csv";
    link.click();
}

// --- ACTIONS ---
function closeKit(id) {
    if(!confirm("Close this kit?")) return;
    const kit = kits.find(k => k.id === id);
    if(kit) { kit.status = 'Closed'; saveData(); renderSidebarKits(); renderClosedKits(); showKitDetails(id); }
}

function reopenKit(id) {
    if(!confirm("Reopen this kit?")) return;
    const kit = kits.find(k => k.id === id);
    if(kit) { kit.status = 'Active'; saveData(); renderSidebarKits(); renderClosedKits(); showKitDetails(id); }
}

function deleteKit(id) {
    if(!confirm("Delete permanently?")) return;
    kits = kits.filter(k => k.id !== id);
    saveData(); renderSidebarKits(); renderClosedKits();
    document.getElementById('kitDetailCard').innerHTML = '<div class="text-center py-10 text-slate-400">Deleted</div>';
}

function openTransferModal(id) {
    const kit = kits.find(k => k.id === id);
    if(kit) {
        document.getElementById('transferKitId').value = kit.id;
        document.getElementById('transferFrom').value = kit.line;
        document.getElementById('transferQty').value = kit.remainingQty;
        document.getElementById('transferModal').classList.remove('hidden');
    }
}

function handleTransferKit(e) {
    e.preventDefault();
    const id = document.getElementById('transferKitId').value;
    const kit = kits.find(k => k.id === id);
    const toLine = document.getElementById('transferTo').value;
    const qty = document.getElementById('transferQty').value;
    
    if(kit) {
        kit.line = toLine; kit.isTransferred = true;
        productionLogs.push({date: new Date().toISOString().split('T')[0], line: toLine, kitId: kit.id, model: kit.model, output: 0, rejection: 0});
        saveData();
        document.getElementById('transferModal').classList.add('hidden');
        renderSidebarKits(); showKitDetails(id);
    }
}

function updateKitSelectDropdown() {
    const s = document.getElementById('kitSelect'); s.innerHTML = '<option value="">Select Kit</option>';
    kits.filter(k=>k.status==='Active').forEach(k => s.innerHTML += `<option value="${k.id}">${k.id} (${k.line})</option>`);
}

function handleShiftEntry(e) {
    e.preventDefault();
    const kit = kits.find(k => k.id === document.getElementById('kitSelect').value);
    if(!kit) return;
    
    const used = parseInt(document.getElementById('inputUsed').value);
    if(used > kit.remainingQty) { alert("Input exceeds remaining!"); return; }

    kit.remainingQty -= used;
    kit.packedQty = (kit.packedQty||0) + parseInt(document.getElementById('outputQty').value);
    kit.rejectionQty = (kit.rejectionQty||0) + parseInt(document.getElementById('rejectionQty').value);
    kit.semiQty = (kit.semiQty||0) + parseInt(document.getElementById('semiQty').value);

    productionLogs.push({
        date: new Date().toISOString().split('T')[0],
        line: document.getElementById('lineSelect').value,
        leader: document.getElementById('leaderName').value,
        kitId: kit.id, model: kit.model,
        input: used,
        output: parseInt(document.getElementById('outputQty').value),
        rejection: parseInt(document.getElementById('rejectionQty').value),
        semi: parseInt(document.getElementById('semiQty').value)
    });

    saveData();
    document.getElementById('shiftMessage').innerText = "Saved!";
    setTimeout(()=>document.getElementById('shiftMessage').innerText="", 2000);
    e.target.reset(); updateKitSelectDropdown();
}

function updateManagerDashboard() {
    const fDate = document.getElementById('filterDate').value;
    const fLine = document.getElementById('filterLine').value;
    
    const logs = productionLogs.filter(l => (!fDate || l.date === fDate) && (fLine === 'All' || l.line === fLine));
    
    let inp=0, pkd=0, rej=0, semi=0;
    logs.forEach(l => { inp+=l.input||0; pkd+=l.output||0; rej+=l.rejection||0; semi+=l.semi||0; });
    
    document.getElementById('statInput').innerText = inp;
    document.getElementById('statPacked').innerText = pkd;
    document.getElementById('statRejection').innerText = rej;
    document.getElementById('statSemi').innerText = semi;
    document.getElementById('statActivities').innerText = pkd + rej;
    document.getElementById('statClosed').innerText = kits.filter(k=>k.status==='Closed' && (fLine==='All'||k.line===fLine)).length;
    document.getElementById('statEfficiency').innerText = inp>0 ? ((pkd/inp)*100).toFixed(1)+'%' : '0%';

    const tbody = document.getElementById('reportTableBody'); tbody.innerHTML = '';
    if(logs.length===0) tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4">No data</td></tr>';
    logs.forEach(l => {
        tbody.innerHTML += `<tr><td class="px-4 py-2">${l.date}</td><td class="px-4">${l.line}</td><td class="px-4">${l.leader||'-'}</td><td class="px-4 font-bold">${l.kitId}</td><td class="px-4">${l.model}</td><td class="px-4 text-right">${l.input||0}</td><td class="px-4 text-right font-bold text-green-600">${l.output||0}</td></tr>`;
    });
}

function saveData() {
    localStorage.setItem('primeXKits', JSON.stringify(kits));
    localStorage.setItem('primeXLogs', JSON.stringify(productionLogs));
}