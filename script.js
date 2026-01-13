/* 
    PRIME X SYSTEM - FINAL VALIDATION
    Fixed: Quantity Mismatch Logic (Output <= Input)
*/

// --- IMPORTS ---
import { loginUser, logoutUser } from './auth.js';
import { db } from './firebase.js';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- GLOBAL VARIABLES ---
let kits = [];
let productionLogs = [];
let currentUserRole = '';

// --- HELPER FUNCTIONS ---
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- FIRESTORE FUNCTIONS ---

async function fetchKits() {
    try {
        const q = await getDocs(collection(db, "kits"));
        let arr = [];
        q.forEach(d => arr.push(d.data()));
        return arr;
    } catch (e) { console.error("Error fetching kits:", e); return []; }
}

async function addKitToFirestore(kitObj) {
    await setDoc(doc(db, "kits", kitObj.id), { ...kitObj, createdAt: serverTimestamp() });
}

async function updateKitInFirestore(kitId, updateObj) {
    await updateDoc(doc(db, "kits", kitId), updateObj);
}

async function deleteKitFromFirestore(kitId) {
    await deleteDoc(doc(db, "kits", kitId));
}

async function addProductionLog(logObj) {
    await addDoc(collection(db, "productionLogs"), { ...logObj, timestamp: serverTimestamp() });
}

async function fetchProductionLogs() {
    try {
        const q = await getDocs(collection(db, "productionLogs"));
        let arr = [];
        q.forEach(d => arr.push({ docId: d.id, ...d.data() }));
        return arr;
    } catch (e) { console.error("Logs error:", e); return []; }
}

async function fetchManagerLogs() {
    try {
        const q = query(collection(db, "loginLogs"), where("role", "==", "Manager")); 
        const snap = await getDocs(q);
        let logs = [];
        snap.forEach(d => logs.push(d.data()));
        return logs.sort((a,b) => b.timestamp - a.timestamp).slice(0, 50); 
    } catch(e) { return []; }
}


// --- MAIN EVENT LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // LOGIN FORM HANDLER
    const loginForm = document.getElementById('firebaseLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const errorMsg = document.getElementById('loginErrorMsg');
            const btn = loginForm.querySelector('button');

            errorMsg.classList.add('hidden');
            btn.innerText = "Logging in...";
            btn.disabled = true;

            try {
                const { uid, role } = await loginUser(email, password);
                await initializeData(role);

                currentUserRole = role;
                document.getElementById('loginSection').classList.add('hidden');
                document.getElementById('header').classList.remove('hidden');
                document.getElementById('mainLayout').classList.remove('hidden');
                document.getElementById('currentRoleDisplay').innerText = role;
                
                setupViewByRole();

            } catch (error) {
                console.error("Login Failed:", error);
                errorMsg.innerText = "Login Failed: " + error.message;
                errorMsg.classList.remove('hidden');
                btn.innerText = "Login Securely";
                btn.disabled = false;
            }
        });
    }

    // LOGOUT
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await logoutUser();
        location.reload();
    });

    // OTHER LISTENERS
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

    // Global Functions
    window.showKitDetails = showKitDetails;
    window.exportClosedKits = exportClosedKits;
    window.exportManagerData = exportManagerData;
    window.closeKit = closeKit;
    window.reopenKit = reopenKit;
    window.deleteKit = deleteKit;
    window.openTransferModal = openTransferModal;
});

// --- DATA INITIALIZATION ---
async function initializeData(role) {
    kits = await fetchKits();
    productionLogs = await fetchProductionLogs();
    
    if (role === 'Data Incharge') {
        const historyLogs = await fetchManagerLogs();
        renderManagerLoginHistory(historyLogs);
    }
}

function renderManagerLoginHistory(logs) {
    const list = document.getElementById('managerLoginList');
    list.innerHTML = '';
    if (logs.length === 0) {
        list.innerHTML = '<div class="italic text-slate-400">No login history available.</div>';
        return;
    }
    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'border-b border-purple-100 pb-1';
        const date = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'Just now';
        item.innerText = `Logged in: ${date}`;
        list.appendChild(item);
    });
}

// --- VIEW CONTROLLER ---
function setupViewByRole() {
    const role = currentUserRole;
    document.getElementById('kitManagementView').classList.add('hidden');
    document.getElementById('lineLeaderView').classList.add('hidden');
    document.getElementById('managerView').classList.add('hidden');
    
    const addBtn = document.getElementById('addKitBtn');
    if(addBtn) addBtn.classList.add('hidden');
    document.getElementById('managerLoginHistoryPanel').classList.add('hidden');

    if (role === 'Data Incharge') {
        document.getElementById('kitManagementView').classList.remove('hidden');
        if(addBtn) addBtn.classList.remove('hidden');
        document.getElementById('managerLoginHistoryPanel').classList.remove('hidden');
        renderSidebarKits();
        renderClosedKits();
    } 
    else if (role === 'Line Leader') {
        document.getElementById('lineLeaderView').classList.remove('hidden');
        updateKitSelectDropdown(); 
    } 
    else if (role === 'Manager') {
        document.getElementById('managerView').classList.remove('hidden');
        document.getElementById('kitManagementView').classList.remove('hidden'); 
        renderSidebarKits();
        renderClosedKits();
        document.getElementById('filterDate').value = ""; 
        updateManagerDashboard();
    }
}

// --- HANDLERS ---

async function handleAddKit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Creating...";

    const newId = document.getElementById('kitIdInput').value.toUpperCase().trim();
    if(kits.some(k => k.id === newId)) { alert("Kit ID exists!"); btn.disabled=false; btn.innerText="Create Kit"; return; }

    const newKit = {
        id: newId,
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        line: document.getElementById('issuedLineInput').value,
        usedQty: 0, packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        status: 'Active', isTransferred: false,
        createdDate: getLocalDateString(),
        createdBy: currentUserRole
    };

    await addKitToFirestore(newKit);
    kits.push(newKit);
    document.getElementById('addKitModal').classList.add('hidden');
    e.target.reset();
    renderSidebarKits();
    btn.disabled = false; btn.innerText = "Create Kit";
}

async function handleShiftEntry(e) {
    e.preventDefault();
    
    const submitBtn = document.querySelector('#shiftForm button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "Checking...";

    const kit = kits.find(k => k.id === document.getElementById('kitSelect').value);
    if(!kit) { submitBtn.disabled = false; return; }
    
    // 1. GET VALUES
    const inputUsed = parseInt(document.getElementById('inputUsed').value) || 0;
    const packed = parseInt(document.getElementById('outputQty').value) || 0;
    const rej = parseInt(document.getElementById('rejectionQty').value) || 0;
    const semi = parseInt(document.getElementById('semiQty').value) || 0;
    const rework = parseInt(document.getElementById('reworkQty').value) || 0;

    // 2. VALIDATION CHECK (Quantity Mismatch)
    const totalOutput = packed + rej + semi + rework;
    if (totalOutput > inputUsed) {
        alert(`⚠️ QUANTITY MISMATCH!\n\nInput Used: ${inputUsed}\nTotal Output: ${totalOutput}\n(Packed + Rej + Semi + Rework)\n\nOutput cannot be greater than Input!`);
        
        // Reset Button
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Entry";
        return; // Stop Process
    }

    submitBtn.innerText = "Saving...";

    const updatedUsed = (kit.usedQty || 0) + inputUsed;
    const updatedPacked = (kit.packedQty || 0) + packed;
    const updatedRej = (kit.rejectionQty || 0) + rej;
    const updatedSemi = (kit.semiQty || 0) + semi;
    const updatedRework = (kit.reworkQty || 0) + rework;
    const updatedRem = kit.totalQty - (updatedPacked + updatedRej);

    const logObj = {
        date: getLocalDateString(),
        line: document.getElementById('lineSelect').value,
        leader: document.getElementById('leaderName').value,
        kitId: kit.id, model: kit.model,
        input: inputUsed, output: packed, rejection: rej, semi: semi, rework: rework,
        remarks: document.getElementById('remarksInput').value
    };

    try {
        await addProductionLog(logObj);
        await updateKitInFirestore(kit.id, {
            usedQty: updatedUsed, packedQty: updatedPacked, rejectionQty: updatedRej,
            semiQty: updatedSemi, reworkQty: updatedRework, remainingQty: updatedRem
        });

        kit.usedQty = updatedUsed;
        kit.packedQty = updatedPacked;
        kit.rejectionQty = updatedRej;
        kit.semiQty = updatedSemi;
        kit.reworkQty = updatedRework;
        kit.remainingQty = updatedRem;
        productionLogs.push(logObj);

        document.getElementById('shiftMessage').innerText = "Saved Successfully!";
        setTimeout(()=>document.getElementById('shiftMessage').innerText="", 2000);
        e.target.reset(); 
        updateKitSelectDropdown();
    } catch (err) {
        alert("Error saving: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Submit Entry";
    }
}

async function handleTransferKit(e) {
    e.preventDefault();
    const id = document.getElementById('transferKitId').value;
    const originalKit = kits.find(k => k.id === id);
    const toLine = document.getElementById('transferTo').value;
    const qty = parseInt(document.getElementById('transferQty').value);
    
    if(!originalKit || qty <= 0) return;

    const newRem = originalKit.remainingQty - qty;
    const newTotal = originalKit.totalQty - qty;
    const newId = originalKit.id + "-TR"; 
    
    const newKit = {
        id: newId, model: originalKit.model, totalQty: qty, line: toLine, remainingQty: qty,
        packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        status: 'Active', isTransferred: true,
        createdDate: getLocalDateString(), createdBy: 'Transfer'
    };
    
    const logObj = { date: getLocalDateString(), line: toLine, kitId: originalKit.id, model: originalKit.model, output: 0, rejection: 0, remarks: `Transferred ${qty} to ${newId}` };

    await updateKitInFirestore(originalKit.id, { totalQty: newTotal, remainingQty: newRem });
    await addKitToFirestore(newKit);
    await addProductionLog(logObj);

    originalKit.totalQty = newTotal; originalKit.remainingQty = newRem;
    kits.push(newKit); productionLogs.push(logObj);

    document.getElementById('transferModal').classList.add('hidden');
    renderSidebarKits(); showKitDetails(id);
}

async function closeKit(id) {
    if(!confirm("Close kit?")) return;
    await updateKitInFirestore(id, { status: 'Closed' });
    kits.find(k => k.id === id).status = 'Closed';
    renderSidebarKits(); renderClosedKits(); showKitDetails(id);
}

async function reopenKit(id) {
    if(!confirm("Reopen kit?")) return;
    await updateKitInFirestore(id, { status: 'Active' });
    kits.find(k => k.id === id).status = 'Active';
    renderSidebarKits(); renderClosedKits(); showKitDetails(id);
}

async function deleteKit(id) {
    if(!confirm("Delete?")) return;
    await deleteKitFromFirestore(id);
    kits = kits.filter(k => k.id !== id);
    renderSidebarKits(); renderClosedKits();
    document.getElementById('kitDetailCard').innerHTML = 'Deleted';
}

// --- RENDERERS ---
function renderSidebarKits() {
    const list = document.getElementById('kitList');
    const searchTerm = document.getElementById('kitSearch').value.toLowerCase();
    list.innerHTML = '';
    const activeKits = kits.filter(k => k.status === 'Active' && (k.id.toLowerCase().includes(searchTerm) || k.model.toLowerCase().includes(searchTerm) || k.line.toLowerCase().includes(searchTerm)));

    if (activeKits.length === 0) { list.innerHTML = '<div class="text-slate-500 text-sm p-4">No active kits.</div>'; return; }

    activeKits.forEach(kit => {
        const div = document.createElement('div');
        const transferClass = kit.isTransferred ? 'is-transferred' : '';
        const badgeHTML = kit.isTransferred ? '<div class="transferred-badge">TRANSFERRED</div>' : '';
        const safeRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);
        div.className = `kit-item ${transferClass}`;
        div.innerHTML = `${badgeHTML}
            <div class="flex justify-between items-start pointer-events-none"><div><div class="font-bold text-sm text-slate-800">${kit.id}</div><div class="text-xs text-slate-500">${kit.model}</div></div><div class="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">${kit.line}</div></div>
            <div class="mt-2 flex justify-between text-xs text-slate-500 pointer-events-none"><span>Total: ${kit.totalQty}</span><span>Rem: <b class="text-slate-800">${safeRem}</b></span></div>`;
        div.onclick = function() { showKitDetails(kit.id); };
        list.appendChild(div);
    });
}

function showKitDetails(kitId) {
    const kit = kits.find(k => k.id === kitId);
    if (!kit) return;
    const card = document.getElementById('kitDetailCard');
    const logs = productionLogs.filter(log => log.kitId === kit.id).reverse();
    
    let logsHTML = '<div class="overflow-auto max-h-40 border border-slate-200 rounded mt-2"><table class="w-full text-xs text-left"><thead class="bg-slate-50"><tr><th class="p-2">Date</th><th class="p-2">Ldr</th><th class="p-2">In</th><th class="p-2">Pk</th><th class="p-2">Rej</th><th class="p-2">Semi</th><th class="p-2">Rwck</th></tr></thead><tbody>';
    logs.forEach(l => logsHTML += `<tr class="border-t border-slate-100"><td class="p-2">${l.date}</td><td class="p-2">${l.leader}</td><td class="p-2">${l.input||0}</td><td class="p-2 text-green-600">${l.output||0}</td><td class="p-2 text-red-600">${l.rejection||0}</td><td class="p-2">${l.semi||0}</td><td class="p-2">${l.rework||0}</td></tr>`);
    logsHTML += '</tbody></table></div>';

    const isCompleted = (kit.packedQty + kit.rejectionQty) === kit.totalQty;
    let actionsHTML = '';
    if(currentUserRole === 'Data Incharge') {
        if(kit.status === 'Active') {
            actionsHTML = `<div class="mt-4 flex gap-2 border-t pt-4"><button onclick="openTransferModal('${kit.id}')" class="flex-1 bg-orange-500 text-white py-2 rounded text-sm">Transfer</button>`;
            actionsHTML += isCompleted ? `<button onclick="closeKit('${kit.id}')" class="flex-1 bg-green-600 text-white py-2 rounded text-sm">Close</button>` : `<button disabled class="flex-1 bg-gray-300 text-gray-500 py-2 rounded text-sm">Close</button>`;
            actionsHTML += `<button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button></div>`;
        } else {
            actionsHTML = `<div class="mt-4 border-t pt-4 flex gap-2"><button onclick="reopenKit('${kit.id}')" class="flex-1 bg-blue-600 text-white py-2 rounded text-sm">Reopen</button><button onclick="deleteKit('${kit.id}')" class="px-3 bg-slate-800 text-white rounded"><i class="fas fa-trash"></i></button></div>`;
        }
    }
    
    const displayRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);
    card.innerHTML = `<div class="flex justify-between items-center mb-4"><div><h3 class="text-2xl font-bold">${kit.id}</h3><p class="text-slate-500 text-sm">${kit.model}</p></div><div class="text-right"><span class="bg-slate-800 text-white px-2 py-1 rounded text-xs">${kit.line}</span></div></div>
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4 text-center"><div class="bg-slate-50 p-2 border"><p class="text-[10px]">IN</p><b>${kit.totalQty}</b></div><div class="bg-green-50 p-2 border"><p class="text-[10px]">PK</p><b>${kit.packedQty}</b></div><div class="bg-red-50 p-2 border"><p class="text-[10px]">RJ</p><b>${kit.rejectionQty}</b></div><div class="bg-orange-50 p-2 border"><p class="text-[10px]">SF</p><b>${kit.semiQty}</b></div><div class="bg-purple-50 p-2 border"><p class="text-[10px]">RW</p><b>${kit.reworkQty}</b></div><div class="bg-blue-50 p-2 border"><p class="text-[10px]">REM</p><b>${displayRem}</b></div></div>
    ${logsHTML}${actionsHTML}`;
}

function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const searchTerm = document.getElementById('closedKitSearch').value.toLowerCase();
    list.innerHTML = '';
    const closed = kits.filter(k => k.status === 'Closed' && (k.id.toLowerCase().includes(searchTerm)));
    if(closed.length === 0) { list.innerHTML = '<p class="text-sm text-slate-500">No closed kits.</p>'; return; }
    closed.forEach(kit => {
        const div = document.createElement('div');
        div.className = 'flex justify-between p-3 bg-slate-50 border rounded mb-2 cursor-pointer';
        div.innerHTML = `<div><div class="font-bold text-sm">${kit.id}</div></div><div class="text-xs text-red-500 font-bold">CLOSED</div>`;
        div.onclick = function() { showKitDetails(kit.id); };
        list.appendChild(div);
    });
}

function updateKitSelectDropdown() {
    const s = document.getElementById('kitSelect'); s.innerHTML = '<option value="">Select Kit</option>';
    kits.filter(k=>k.status==='Active').forEach(k => s.innerHTML += `<option value="${k.id}">${k.id} (${k.line})</option>`);
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
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : 0;
        csv += `${l.date},${l.line},${l.leader},${l.kitId},${l.model},${l.input||0},${l.output||0},${l.rejection||0},${l.semi||0},${l.rework||0},${rem},${l.remarks||''}\n`;
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "Production_Logs.csv";
    link.click();
}