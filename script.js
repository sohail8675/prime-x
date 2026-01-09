/* 
    PRIME X SYSTEM - FINAL 
    Updated by Sohail (Specific Logic Updates)
*/

// --- 1. GLOBAL VARIABLES ---
let kits = JSON.parse(localStorage.getItem('primeXKits')) || [];
let productionLogs = JSON.parse(localStorage.getItem('primeXLogs')) || [];
let currentUserRole = '';

// --- 2. LOGIN ---
function login(role) {
    currentUserRole = role;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('mainLayout').classList.remove('hidden');
    document.getElementById('currentRoleDisplay').innerText = role;
    setupViewByRole();
}

// --- 3. VIEW CONTROLLER ---
function setupViewByRole() {
    const role = currentUserRole;
    document.getElementById('kitManagementView').classList.add('hidden');
    document.getElementById('lineLeaderView').classList.add('hidden');
    document.getElementById('managerView').classList.add('hidden');
    const addBtn = document.getElementById('addKitBtn');
    if(addBtn) addBtn.classList.add('hidden');

    if (role === 'Data Incharge') {
        document.getElementById('kitManagementView').classList.remove('hidden');
        if(addBtn) addBtn.classList.remove('hidden');
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

// --- 4. EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutBtn').addEventListener('click', () => location.reload());
    
    document.getElementById('addKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.remove('hidden'));
    document.getElementById('closeAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('cancelAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('addKitForm').addEventListener('submit', handleAddKit);

    document.getElementById('closeTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('cancelTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('transferForm').addEventListener('submit', handleTransferKit);

    document.getElementById('shiftForm').addEventListener('submit', handleShiftEntry);
    document.getElementById('applyFilter').addEventListener('click', updateManagerDashboard);
    document.getElementById('kitSearch').addEventListener('keyup', renderSidebarKits);
    document.getElementById('closedKitSearch').addEventListener('keyup', renderClosedKits);
});

// --- 5. DATA FUNCTIONS ---

function handleAddKit(e) {
    e.preventDefault();
    if(currentUserRole !== 'Data Incharge') return;

    const newId = document.getElementById('kitIdInput').value.toUpperCase().trim();
    if(kits.some(k => k.id === newId)) { alert(`Error: Kit ID "${newId}" already exists!`); return; }

    const newKit = {
        id: newId,
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        line: document.getElementById('issuedLineInput').value,
        
        usedQty: 0, packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        
        status: 'Active', isTransferred: false,
        createdDate: new Date().toISOString().split('T')[0],
        createdBy: currentUserRole, // Track who added
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
        const safeRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);

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
                <span>Rem: <b class="text-slate-800">${safeRem}</b></span>
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
    
    // Expanded Mini Table Header
    let logsHTML = '<div class="overflow-auto max-h-40 border border-slate-200 rounded mt-2"><table class="w-full text-xs text-left"><thead class="bg-slate-50"><tr><th class="p-2">Date</th><th class="p-2">Leader</th><th class="p-2">Input</th><th class="p-2">Pack</th><th class="p-2">Rej</th><th class="p-2">Semi</th><th class="p-2">Rwck</th><th class="p-2">Rem</th></tr></thead><tbody>';
    
    if(historyLogs.length > 0) {
        historyLogs.reverse().forEach(log => {
            // Calculate Rem for that log moment is complex, so we show current Rem of kit or blank
            const rem = kit.totalQty - (kit.packedQty + kit.rejectionQty); 
            logsHTML += `<tr class="border-t border-slate-100"><td class="p-2 text-slate-600">${log.date}</td><td class="p-2">${log.leader}</td><td class="p-2">${log.input||0}</td><td class="p-2 text-green-600 font-bold">${log.output||0}</td><td class="p-2 text-red-600">${log.rejection||0}</td><td class="p-2 text-orange-600">${log.semi||0}</td><td class="p-2 text-purple-600">${log.rework||0}</td><td class="p-2 text-blue-600">${rem}</td></tr>`;
        });
    } else {
        logsHTML += '<tr><td colspan="8" class="p-2 text-center text-slate-400">No logs.</td></tr>';
    }
    logsHTML += '</tbody></table></div>';

    // STRICT CLOSE LOGIC: Only show if Fully Completed
    const isCompleted = (kit.packedQty + kit.rejectionQty) === kit.totalQty;
    
    let actionsHTML = '';
    if(currentUserRole === 'Data Incharge') {
        if(kit.status === 'Active') {
            actionsHTML = `<div class="mt-4 flex gap-2 border-t border-slate-100 pt-4">`;
            
            // Transfer always available
            actionsHTML += `<button onclick="openTransferModal('${kit.id}')" class="flex-1 bg-orange-500 text-white py-2 rounded text-sm font-semibold">Transfer</button>`;
            
            // Close ONLY if completed
            if(isCompleted) {
                actionsHTML += `<button onclick="closeKit('${kit.id}')" class="flex-1 bg-green-600 text-white py-2 rounded text-sm font-semibold">Finish & Close</button>`;
            } else {
                 actionsHTML += `<button disabled class="flex-1 bg-gray-300 text-gray-500 py-2 rounded text-sm font-semibold cursor-not-allowed" title="Kit not finished">Close</button>`;
            }
            
            actionsHTML += `<button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button></div>`;
        } else {
            actionsHTML = `
                <div class="mt-4 border-t border-slate-100 pt-4 flex gap-2">
                    <button onclick="reopenKit('${kit.id}')" class="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-semibold">Reopen</button>
                    <button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button>
                </div>`;
        }
    }

    const transferBanner = kit.isTransferred ? `<div class="bg-orange-50 border border-orange-200 text-orange-800 p-2 rounded mb-2 text-xs font-bold">TRANSFERRED KIT</div>` : '';
    const displayRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);

    card.innerHTML = `
        ${transferBanner}
        <div class="flex justify-between items-center mb-4">
            <div><h3 class="text-2xl font-bold text-slate-900">${kit.id}</h3><p class="text-slate-500 text-sm">Model: ${kit.model}</p></div>
            <div class="text-right"><span class="bg-slate-800 text-white px-2 py-1 rounded text-xs">${kit.line}</span><p class="text-xs mt-1 text-slate-400">By: ${kit.createdBy || 'System'}</p></div>
        </div>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4 text-center">
            <div class="bg-slate-50 p-2 rounded border"><p class="text-[10px] uppercase text-slate-500">Input</p><p class="font-bold">${kit.totalQty}</p></div>
            <div class="bg-green-50 p-2 rounded border border-green-100"><p class="text-[10px] uppercase text-green-600">Pack</p><p class="font-bold text-green-700">${kit.packedQty||0}</p></div>
            <div class="bg-red-50 p-2 rounded border border-red-100"><p class="text-[10px] uppercase text-red-600">Rej</p><p class="font-bold text-red-700">${kit.rejectionQty||0}</p></div>
            <div class="bg-orange-50 p-2 rounded border border-orange-100"><p class="text-[10px] uppercase text-orange-600">Semi FG</p><p class="font-bold text-orange-700">${kit.semiQty||0}</p></div>
            <div class="bg-purple-50 p-2 rounded border border-purple-100"><p class="text-[10px] uppercase text-purple-600">Rework</p><p class="font-bold text-purple-700">${kit.reworkQty||0}</p></div>
            <div class="bg-blue-50 p-2 rounded border border-blue-100"><p class="text-[10px] uppercase text-blue-600">Rem</p><p class="font-bold text-blue-700">${displayRem}</p></div>
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
    let csv = "Kit ID,Model,Line,Date,Input,Packed,Reject,SemiFG,Rework,Remain\n";
    closed.forEach(k => { 
        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        csv += `${k.id},${k.model},${k.line},${k.createdDate},${k.totalQty},${k.packedQty},${k.rejectionQty},${k.semiQty||0},${k.reworkQty||0},${rem}\n`; 
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "Closed_Kits.csv";
    link.click();
}

function exportManagerData() {
    const fDate = document.getElementById('filterDate').value;
    const fLine = document.getElementById('filterLine').value;
    const logs = productionLogs.filter(l => (!fDate || l.date === fDate) && (fLine === 'All' || l.line === fLine));

    if(logs.length === 0) { alert("No logs to export."); return; }
    let csv = "Date,Line,Leader,Kit ID,Model,Input Used,Packed,Rejection,Semi FG,Rework,Rem Kit,Remarks\n";
    logs.forEach(l => {
        // Find Kit to get its current remaining
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : 0;
        csv += `${l.date},${l.line},${l.leader},${l.kitId},${l.model},${l.input||0},${l.output||0},${l.rejection||0},${l.semi||0},${l.rework||0},${rem},${l.remarks||''}\n`;
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "Production_Logs.csv";
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
        document.getElementById('transferQty').value = kit.totalQty - (kit.packedQty + kit.rejectionQty); // Suggest remaining
        document.getElementById('transferModal').classList.remove('hidden');
    }
}

// NEW TRANSFER LOGIC: SPLIT KIT
function handleTransferKit(e) {
    e.preventDefault();
    const id = document.getElementById('transferKitId').value;
    const originalKit = kits.find(k => k.id === id);
    const toLine = document.getElementById('transferTo').value;
    const qty = parseInt(document.getElementById('transferQty').value);
    
    if(!originalKit || qty <= 0) return;

    // 1. Reduce Original Kit
    originalKit.totalQty -= qty;
    originalKit.remainingQty -= qty; // Simple logic update

    // 2. Create New Transferred Kit
    const newId = originalKit.id + "-TR"; // Simple Suffix
    const newKit = {
        id: newId,
        model: originalKit.model,
        totalQty: qty,
        line: toLine,
        remainingQty: qty,
        packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        status: 'Active', isTransferred: true,
        createdDate: new Date().toISOString().split('T')[0],
        createdBy: 'Transfer',
        logs: []
    };
    
    kits.push(newKit);
    
    // Log
    productionLogs.push({date: new Date().toISOString().split('T')[0], line: toLine, kitId: originalKit.id, model: originalKit.model, output: 0, rejection: 0, remarks: `Transferred ${qty} to ${newId}`});

    saveData();
    document.getElementById('transferModal').classList.add('hidden');
    renderSidebarKits(); 
    showKitDetails(id);
    alert(`Transferred ${qty} pcs. New Kit: ${newId} created.`);
}

function updateKitSelectDropdown() {
    const s = document.getElementById('kitSelect'); s.innerHTML = '<option value="">Select Kit</option>';
    kits.filter(k=>k.status==='Active').forEach(k => s.innerHTML += `<option value="${k.id}">${k.id} (${k.line})</option>`);
}

function handleShiftEntry(e) {
    e.preventDefault();
    const kit = kits.find(k => k.id === document.getElementById('kitSelect').value);
    if(!kit) return;
    
    const inputUsed = parseInt(document.getElementById('inputUsed').value) || 0;
    const packed = parseInt(document.getElementById('outputQty').value) || 0;
    const rej = parseInt(document.getElementById('rejectionQty').value) || 0;
    const semi = parseInt(document.getElementById('semiQty').value) || 0;
    const rework = parseInt(document.getElementById('reworkQty').value) || 0;

    kit.usedQty = (kit.usedQty || 0) + inputUsed;
    kit.packedQty = (kit.packedQty || 0) + packed;
    kit.rejectionQty = (kit.rejectionQty || 0) + rej;
    kit.semiQty = (kit.semiQty || 0) + semi; // Just tracking sum
    kit.reworkQty = (kit.reworkQty || 0) + rework;
    
    // Update simple remainingQty property
    kit.remainingQty = kit.totalQty - (kit.packedQty + kit.rejectionQty);

    productionLogs.push({
        date: new Date().toISOString().split('T')[0],
        line: document.getElementById('lineSelect').value,
        leader: document.getElementById('leaderName').value,
        kitId: kit.id, model: kit.model,
        input: inputUsed, output: packed, rejection: rej, semi: semi, rework: rework,
        remarks: document.getElementById('remarksInput').value
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
    
    // CHANGED: Active Kits Count
    const activeCount = kits.filter(k => k.status === 'Active' && (fLine === 'All' || k.line === fLine)).length;
    document.getElementById('statActiveKits').innerText = activeCount;

    document.getElementById('statClosed').innerText = kits.filter(k=>k.status==='Closed' && (fLine==='All'||k.line===fLine)).length;
    document.getElementById('statEfficiency').innerText = inp>0 ? ((pkd/inp)*100).toFixed(1)+'%' : '0%';

    const tbody = document.getElementById('reportTableBody'); tbody.innerHTML = '';
    if(logs.length===0) tbody.innerHTML = '<tr><td colspan="10" class="text-center p-4">No data</td></tr>';
    logs.forEach(l => {
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : 0;
        
        tbody.innerHTML += `<tr>
            <td class="px-4 py-2">${l.date}</td>
            <td class="px-4">${l.line}</td>
            <td class="px-4 font-bold">${l.kitId}</td>
            <td class="px-4">${l.model}</td>
            <td class="px-4 text-right">${l.input||0}</td>
            <td class="px-4 text-right font-bold text-green-600">${l.output||0}</td>
            <td class="px-4 text-right text-red-600">${l.rejection||0}</td>
            <td class="px-4 text-right text-orange-600">${l.semi||0}</td>
            <td class="px-4 text-right text-purple-600">${l.rework||0}</td>
            <td class="px-4 text-right text-blue-600">${rem}</td>
        </tr>`;
    });
}

function saveData() {
    localStorage.setItem('primeXKits', JSON.stringify(kits));
    localStorage.setItem('primeXLogs', JSON.stringify(productionLogs));
}