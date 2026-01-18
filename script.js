/* 
    PRIME X SYSTEM - PRO EDITION v3.1
    Preserved Logic + Date Range & Creation Manifest
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

function playSound(type) {
    const s = document.getElementById(type === 'success' ? 'soundSuccess' : 'soundError');
    if(s) { s.currentTime = 0; s.play().catch(e => console.log("Audio play blocked", e)); }
}

function getKitAge(dateString) {
    const created = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
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
            const originalBtnText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Authenticating...';
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
                errorMsg.innerText = "Access Denied: " + error.message;
                errorMsg.classList.remove('hidden');
                btn.innerHTML = originalBtnText;
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
    
    // FILTERS
    document.getElementById('sidebarFilterBtn').addEventListener('click', renderSidebarKits);
    document.getElementById('kitSearch').addEventListener('keyup', renderSidebarKits); 
    // NEW: Date Listeners
    document.getElementById('sidebarDateStart').addEventListener('change', renderSidebarKits);
    document.getElementById('sidebarDateEnd').addEventListener('change', renderSidebarKits);
    
    document.getElementById('closedFilterBtn').addEventListener('click', renderClosedKits);
    document.getElementById('closedKitSearch').addEventListener('keyup', renderClosedKits);
    // NEW: Closed Date Listeners
    document.getElementById('closedDateStart').addEventListener('change', renderClosedKits);
    document.getElementById('closedDateEnd').addEventListener('change', renderClosedKits);


    // AUTO FILL CALCULATION LISTENER
    const formInputs = ['inputUsed', 'outputQty', 'rejectionQty', 'semiQty', 'reworkQty'];
    formInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculationDisplay);
    });

    // BUG FIX & ACTIVE KIT LOGIC
    document.getElementById('lineSelect').addEventListener('change', function() {
        const selectedLine = this.value;
        const s = document.getElementById('kitSelect');
        s.innerHTML = ''; 

        if (!selectedLine) {
            s.innerHTML = '<option value="">Select Line First</option>';
            return;
        }
        
        const lineKits = kits.filter(k => k.status === 'Active' && k.line === selectedLine);
        
        if (lineKits.length === 0) {
            s.innerHTML = '<option value="">No Active Kits</option>';
        } else {
            s.innerHTML = '<option value="">Select Kit</option>';
            lineKits.forEach(k => {
                const rem = k.totalQty - (k.packedQty + k.rejectionQty);
                s.innerHTML += `<option value="${k.id}">${k.id} (Rem: ${rem} | ${k.createdDate})</option>`;
            });
        }
    });

    document.getElementById('kitSelect').addEventListener('change', function() {
        const selectedId = this.value;
        const kit = kits.find(k => k.id === selectedId);
        if(kit) {
            document.getElementById('modelDisplay').value = `${kit.model} (Issued: ${kit.createdDate})`;
        } else {
            document.getElementById('modelDisplay').value = "";
        }
    });

    // Global Functions
    window.showKitDetails = showKitDetails;
    window.exportClosedKits = exportClosedKits;
    window.exportManagerData = exportManagerData;
    window.closeKit = closeKit;
    window.reopenKit = reopenKit;
    window.deleteKit = deleteKit;
    window.openTransferModal = openTransferModal;
});

// AUTO FILL CALCULATION LOGIC
function updateCalculationDisplay() {
    const inp = parseInt(document.getElementById('inputUsed').value) || 0;
    const out = parseInt(document.getElementById('outputQty').value) || 0;
    const rej = parseInt(document.getElementById('rejectionQty').value) || 0;
    const semi = parseInt(document.getElementById('semiQty').value) || 0;
    const rework = parseInt(document.getElementById('reworkQty').value) || 0;
    
    const totalOut = out + rej + semi + rework;
    const diff = inp - totalOut;
    
    const helper = document.getElementById('calcHelper');
    const diffSpan = document.getElementById('calcDiff');
    
    if(inp > 0 || totalOut > 0) {
        helper.classList.remove('hidden');
        diffSpan.innerText = diff;
        if(diff < 0) { 
            helper.classList.replace('bg-blue-900/20', 'bg-red-900/20');
            helper.classList.replace('text-blue-300', 'text-red-400');
            diffSpan.innerText = diff + " (Mismatch)";
        } else {
            helper.classList.replace('bg-red-900/20', 'bg-blue-900/20');
            helper.classList.replace('text-red-400', 'text-blue-300');
        }
    } else {
        helper.classList.add('hidden');
    }
}

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
        list.innerHTML = '<div class="italic opacity-50">No login history available.</div>';
        return;
    }
    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'border-b border-purple-500/10 pb-1 flex justify-between';
        const date = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString() : 'Just now';
        item.innerHTML = `<span>Login</span> <span class="opacity-70">${date}</span>`;
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

    document.getElementById('entryDate').value = getLocalDateString();

    if (role === 'Data Incharge') {
        document.getElementById('kitManagementView').classList.remove('hidden');
        if(addBtn) addBtn.classList.remove('hidden');
        document.getElementById('managerLoginHistoryPanel').classList.remove('hidden');
        renderSidebarKits();
        renderClosedKits();
    } 
    else if (role === 'Line Leader') {
        document.getElementById('lineLeaderView').classList.remove('hidden');
    } 
    else if (role === 'Manager') {
        document.getElementById('managerView').classList.remove('hidden');
        document.getElementById('kitManagementView').classList.remove('hidden'); 
        renderSidebarKits();
        renderClosedKits();
        document.getElementById('filterStartDate').value = ""; 
        document.getElementById('filterEndDate').value = ""; 
        updateManagerDashboard();
    }
}

// --- HANDLERS ---

function openTransferModal(kitId) {
    const kit = kits.find(k => k.id === kitId);
    if (!kit) return;
    document.getElementById('transferKitId').value = kit.id;
    document.getElementById('transferFrom').value = kit.line;
    document.getElementById('transferTo').value = "";
    document.getElementById('transferQty').value = "";
    document.getElementById('transferRemarks').value = ""; 
    document.getElementById('transferModal').classList.remove('hidden');
}

async function handleAddKit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerText = "Processing...";

    const newId = document.getElementById('kitIdInput').value.toUpperCase().trim();
    if(kits.some(k => k.id === newId)) { alert("Kit ID exists!"); btn.disabled=false; btn.innerText="Create Kit"; return; }

    const dateInput = document.getElementById('kitDateInput').value;
    const finalDate = dateInput || getLocalDateString();

    const newKit = {
        id: newId,
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        line: document.getElementById('issuedLineInput').value,
        usedQty: 0, packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value) || 0,
        status: 'Active', isTransferred: false,
        createdDate: finalDate, 
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
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating...';

    const kit = kits.find(k => k.id === document.getElementById('kitSelect').value);
    if(!kit) { submitBtn.disabled = false; return; }
    
    const selectedDate = document.getElementById('entryDate').value || getLocalDateString();

    const pqcName = document.getElementById('pqcSelect').value; 
    const inputUsed = parseInt(document.getElementById('inputUsed').value) || 0;
    const packed = parseInt(document.getElementById('outputQty').value) || 0;
    const rej = parseInt(document.getElementById('rejectionQty').value) || 0;
    const semi = parseInt(document.getElementById('semiQty').value) || 0;
    const rework = parseInt(document.getElementById('reworkQty').value) || 0;

    const totalOutput = packed + rej + semi + rework;
    if (totalOutput > inputUsed) {
        playSound('error'); 
        alert(`⚠️ QUANTITY MISMATCH!\nOutput cannot be greater than Input!`);
        submitBtn.disabled = false;
        submitBtn.innerText = "Commit Data Entry";
        return; 
    }

    submitBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Syncing...';

    const updatedUsed = (kit.usedQty || 0) + inputUsed;
    const updatedPacked = (kit.packedQty || 0) + packed;
    const updatedRej = (kit.rejectionQty || 0) + rej;
    const updatedSemi = (kit.semiQty || 0) + semi;
    const updatedRework = (kit.reworkQty || 0) + rework;
    const updatedRem = kit.totalQty - (updatedPacked + updatedRej);

    const logObj = {
        date: selectedDate, 
        line: document.getElementById('lineSelect').value,
        leader: document.getElementById('leaderName').value,
        pqc: pqcName, 
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

        playSound('success'); 
        
        document.getElementById('resInput').innerText = inputUsed;
        document.getElementById('resOutput').innerText = packed;
        document.getElementById('resRej').innerText = rej;
        
        const waText = `*PRIME X Update*%0A------------------%0ADate: ${selectedDate}%0ALine: ${logObj.line}%0ALeader: ${logObj.leader}%0APQC: ${pqcName}%0AKit: ${logObj.kitId}%0AModel: ${logObj.model}%0ARemaining: ${updatedRem}%0A------------------%0AInput: ${inputUsed}%0AOutput: ${packed}%0ARejection: ${rej}`;
        document.getElementById('whatsappShareBtn').onclick = () => {
            window.open(`https://wa.me/?text=${waText}`, '_blank');
        };

        document.getElementById('resultModal').classList.remove('hidden');

        // Reset
        document.getElementById('inputUsed').value = "";
        document.getElementById('outputQty').value = "";
        document.getElementById('rejectionQty').value = "";
        document.getElementById('semiQty').value = "";
        document.getElementById('reworkQty').value = "";
        document.getElementById('remarksInput').value = "";
        document.getElementById('calcHelper').classList.add('hidden'); 
        document.getElementById('inputUsed').dispatchEvent(new Event('input'));

    } catch (err) {
        alert("Error saving: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Commit Data Entry';
    }
}

async function handleTransferKit(e) {
    e.preventDefault();
    const id = document.getElementById('transferKitId').value;
    const originalKit = kits.find(k => k.id === id);
    const toLine = document.getElementById('transferTo').value;
    const qty = parseInt(document.getElementById('transferQty').value);
    const remarks = document.getElementById('transferRemarks').value; 
    
    if(!originalKit || qty <= 0) return;

    if (qty > originalKit.remainingQty) {
        alert("Transfer quantity cannot be more than remaining quantity!");
        return;
    }

    const newRem = originalKit.remainingQty - qty;
    const newTotal = originalKit.totalQty - qty;
    const newId = originalKit.id + "-TR"; 
    
    const newKit = {
        id: newId, model: originalKit.model, totalQty: qty, line: toLine, remainingQty: qty,
        packedQty: 0, rejectionQty: 0, semiQty: 0, reworkQty: 0,
        status: 'Active', isTransferred: true,
        createdDate: getLocalDateString(), createdBy: 'Transfer'
    };
    
    // FIX: Removed undefined entries. Using 'SYSTEM' constant.
    const logObj = { 
        date: getLocalDateString(), 
        line: toLine, 
        leader: "SYSTEM",
        pqc: "TRANSFER",
        kitId: originalKit.id, 
        model: originalKit.model, 
        input: 0,
        output: 0, 
        rejection: 0, 
        semi: 0,
        rework: 0,
        remarks: `Transferred ${qty} pcs to ${newId}. Note: ${remarks}` 
    };

    await updateKitInFirestore(originalKit.id, { totalQty: newTotal, remainingQty: newRem });
    await addKitToFirestore(newKit);
    await addProductionLog(logObj);

    originalKit.totalQty = newTotal; originalKit.remainingQty = newRem;
    kits.push(newKit); productionLogs.push(logObj);

    document.getElementById('transferModal').classList.add('hidden');
    renderSidebarKits(); 
    showKitDetails(id);
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
    document.getElementById('kitDetailCard').innerHTML = '<div class="text-slate-500 py-10 text-center">Unit Deleted</div>';
}

// --- RENDERERS ---

function renderSidebarKits() {
    const list = document.getElementById('kitList');
    
    // Skeleton Loading Effect
    if(list.children.length === 0) list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

    const searchTerm = document.getElementById('kitSearch').value.toLowerCase();
    
    // UPDATED: Date Range Logic
    const start = document.getElementById('sidebarDateStart').value;
    const end = document.getElementById('sidebarDateEnd').value;
    
    const lineFilter = document.getElementById('sidebarLineFilter').value;

    const activeKits = kits.filter(k => {
        const isStatusMatch = k.status === 'Active';
        const isSearchMatch = k.id.toLowerCase().includes(searchTerm) || k.model.toLowerCase().includes(searchTerm);
        
        // Date Range Match
        const isDateMatch = (!start || k.createdDate >= start) && (!end || k.createdDate <= end);
        
        const isLineMatch = !lineFilter || lineFilter === "All Lines" || k.line === lineFilter;
        return isStatusMatch && isSearchMatch && isDateMatch && isLineMatch;
    });

    // UPDATE ACTIVE COUNT BADGE
    const countBadge = document.getElementById('activeCountBadge');
    if(countBadge) countBadge.innerText = activeKits.length;

    list.innerHTML = '';
    
    if (activeKits.length === 0) { 
        list.innerHTML = '<div class="text-slate-500 text-xs p-4 text-center border border-dashed border-slate-700 rounded mt-4">No active units found.</div>'; 
        return; 
    }

    activeKits.forEach(kit => {
        const div = document.createElement('div');
        
        // Calculations
        const safeRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);
        const remPercent = (safeRem / kit.totalQty) * 100;
        const daysOld = getKitAge(kit.createdDate);
        
        // Classes & Styles
        const transferClass = kit.isTransferred ? 'is-transferred' : '';
        const badgeHTML = kit.isTransferred ? '<div class="transferred-badge">TRANSFERRED</div>' : '';
        
        // Dynamic Remaining Color
        let remColorClass = 'text-dynamic-high';
        if(remPercent < 50) remColorClass = 'text-dynamic-med';
        if(remPercent < 20) remColorClass = 'text-dynamic-low';

        // New Arrival Glow (First 2 days)
        const glowClass = daysOld <= 2 ? 'glow-new' : '';

        // Quality Grade (Based on rejection rate)
        const rejRate = kit.packedQty > 0 ? (kit.rejectionQty / (kit.packedQty + kit.rejectionQty)) * 100 : 0;
        let gradeHTML = '<span class="grade-badge grade-A" data-tooltip="Excellent Quality">A</span>';
        if(rejRate > 2) gradeHTML = '<span class="grade-badge grade-B" data-tooltip="Modreate Rejection">B</span>';
        if(rejRate > 5) gradeHTML = '<span class="grade-badge grade-C" data-tooltip="High Rejection">C</span>';

        // Line Avatar Logic (L1, L2...)
        const lineShort = kit.line.replace('Line ', 'L').trim();

        div.className = `kit-item ${transferClass} ${glowClass} group`;
        div.innerHTML = `
            ${badgeHTML}
            ${gradeHTML}
            <div class="flex items-start gap-3 mb-3 pointer-events-none">
                <!-- Line Avatar -->
                <div class="line-avatar">${lineShort}</div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-slate-200 tracking-wide truncate">${kit.id}</div>
                    <div class="text-[10px] text-slate-400 font-mono truncate" title="${kit.model}">${kit.model}</div>
                </div>
            </div>
            
            <!-- Mini Stat Grid -->
            <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2 pointer-events-none">
                <div class="mini-stat">Input <b class="text-slate-300">${kit.totalQty}</b></div>
                <div class="mini-stat">Packed <b class="text-green-400">${kit.packedQty}</b></div>
                <div class="mini-stat">Rem <b class="${remColorClass}">${safeRem}</b></div>
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
    const logs = productionLogs.filter(log => log.kitId === kit.id).reverse();
    
    let logsHTML = '<div class="overflow-auto max-h-48 border border-white/5 rounded-lg mt-4 custom-scrollbar"><table class="w-full text-xs text-left text-slate-300"><thead class="bg-slate-900 sticky top-0"><tr><th class="p-2">Date</th><th class="p-2">Ldr</th><th class="p-2">PQC</th><th class="p-2">In</th><th class="p-2">Pk</th><th class="p-2">Rej</th><th class="p-2">Semi</th><th class="p-2">Rwck</th></tr></thead><tbody class="divide-y divide-white/5 font-mono">';
    logs.forEach(l => logsHTML += `<tr><td class="p-2">${l.date}</td><td class="p-2">${l.leader}</td><td class="p-2">${l.pqc||'-'}</td><td class="p-2">${l.input||0}</td><td class="p-2 text-green-400">${l.output||0}</td><td class="p-2 text-red-400">${l.rejection||0}</td><td class="p-2">${l.semi||0}</td><td class="p-2">${l.rework||0}</td></tr>`);
    logsHTML += '</tbody></table></div>';

    const isCompleted = (kit.packedQty + kit.rejectionQty) === kit.totalQty;
    let actionsHTML = '';
    if(currentUserRole === 'Data Incharge') {
        if(kit.status === 'Active') {
            actionsHTML = `<div class="mt-4 flex gap-2 border-t border-white/5 pt-4"><button onclick="openTransferModal('${kit.id}')" class="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-2 rounded text-xs font-bold transition">Transfer Unit</button>`;
            actionsHTML += isCompleted ? `<button onclick="closeKit('${kit.id}')" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded text-xs font-bold transition">Close Unit</button>` : `<button disabled class="flex-1 bg-slate-800 text-slate-600 border border-slate-700 py-2 rounded text-xs font-bold cursor-not-allowed">Close Locked</button>`;
            actionsHTML += `<button onclick="deleteKit('${kit.id}')" class="px-3 bg-red-900/30 text-red-400 border border-red-500/30 hover:bg-red-900/50 rounded transition"><i class="fas fa-trash"></i></button></div>`;
        } else {
            actionsHTML = `<div class="mt-4 border-t border-white/5 pt-4 flex gap-2"><button onclick="reopenKit('${kit.id}')" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-bold">Reactivate Unit</button><button onclick="deleteKit('${kit.id}')" class="px-3 bg-red-900/30 text-red-400 border border-red-500/30 rounded"><i class="fas fa-trash"></i></button></div>`;
        }
    }
    
    const displayRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);
    
    // PROGRESS BAR
    const progress = Math.min(((kit.packedQty + kit.rejectionQty) / kit.totalQty) * 100, 100);
    const progressColor = progress === 100 ? 'bg-emerald-500' : 'bg-blue-500';

    card.innerHTML = `
    <div class="flex justify-between items-center mb-4">
        <div>
            <div class="flex items-center gap-3">
                <h3 class="text-3xl font-bold text-white tracking-tight">${kit.id}</h3>
                <span class="bg-slate-800 text-cyan-400 px-2 py-1 rounded text-xs font-mono border border-cyan-500/30">${kit.line}</span>
            </div>
            <p class="text-slate-400 text-sm mt-1 font-mono">${kit.model}</p>
        </div>
        <div class="text-right">
             <span class="text-[10px] text-slate-500 uppercase block">Current Status</span>
             <span class="text-xs ${kit.status==='Active'?'text-green-400':'text-red-400'} font-bold uppercase tracking-wider">${kit.status}</span>
        </div>
    </div>
    
    <!-- NEW: Creation Manifest (Initial Details) -->
    <div class="grid grid-cols-4 gap-2 mb-4 p-3 bg-white/5 rounded-lg border border-white/5">
        <div><p class="text-[10px] text-slate-500">ISSUED DATE</p><p class="text-xs text-white font-mono">${kit.createdDate}</p></div>
        <div><p class="text-[10px] text-slate-500">INITIAL QTY</p><p class="text-xs text-white font-mono">${kit.totalQty}</p></div>
        <div><p class="text-[10px] text-slate-500">ISSUED LINE</p><p class="text-xs text-white font-mono">${kit.line}</p></div>
        <div><p class="text-[10px] text-slate-500">ISSUED BY</p><p class="text-xs text-white font-mono">${kit.createdBy || 'System'}</p></div>
    </div>

    <div class="w-full bg-slate-800 rounded-full h-1.5 mb-6 overflow-hidden">
        <div class="${progressColor} h-1.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
    </div>

    <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4 text-center">
        <div class="bg-slate-800/50 p-2 rounded border border-white/5"><p class="text-[10px] text-slate-500 uppercase">Input</p><b class="text-white text-lg">${kit.totalQty}</b></div>
        <div class="bg-green-900/20 p-2 rounded border border-green-500/20"><p class="text-[10px] text-green-400 uppercase">Packed</p><b class="text-green-400 text-lg">${kit.packedQty}</b></div>
        <div class="bg-red-900/20 p-2 rounded border border-red-500/20"><p class="text-[10px] text-red-400 uppercase">Reject</p><b class="text-red-400 text-lg">${kit.rejectionQty}</b></div>
        <div class="bg-orange-900/20 p-2 rounded border border-orange-500/20"><p class="text-[10px] text-orange-400 uppercase">Semi</p><b class="text-orange-400 text-lg">${kit.semiQty}</b></div>
        <div class="bg-purple-900/20 p-2 rounded border border-purple-500/20"><p class="text-[10px] text-purple-400 uppercase">Rework</p><b class="text-purple-400 text-lg">${kit.reworkQty}</b></div>
        <div class="bg-blue-900/20 p-2 rounded border border-blue-500/20"><p class="text-[10px] text-blue-400 uppercase">Rem</p><b class="text-blue-400 text-lg">${displayRem}</b></div>
    </div>
    ${logsHTML}${actionsHTML}`;
}

function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const searchTerm = document.getElementById('closedKitSearch').value.toLowerCase();
    
    // UPDATED: Date Range Logic
    const start = document.getElementById('closedDateStart').value;
    const end = document.getElementById('closedDateEnd').value;
    
    const lineFilter = document.getElementById('closedLineFilter').value;

    const closed = kits.filter(k => {
        const isStatusMatch = k.status === 'Closed';
        const isSearchMatch = k.id.toLowerCase().includes(searchTerm);
        
        // Date Range Match
        const isDateMatch = (!start || k.createdDate >= start) && (!end || k.createdDate <= end);
        
        const isLineMatch = !lineFilter || lineFilter === "All Lines" || k.line === lineFilter;
        return isStatusMatch && isSearchMatch && isDateMatch && isLineMatch;
    });

    // UPDATE CLOSED COUNT BADGE
    const badge = document.getElementById('closedCountBadge');
    if(badge) badge.innerText = closed.length;

    list.innerHTML = '';
    
    if(closed.length === 0) { list.innerHTML = '<p class="text-xs text-slate-500 italic p-2">No archived units match.</p>'; return; }
    
    closed.forEach(kit => {
        const div = document.createElement('div');
        div.className = 'flex justify-between p-3 bg-slate-800/50 border border-slate-700 rounded mb-2 cursor-pointer hover:border-slate-500 transition';
        div.innerHTML = `<div><div class="font-bold text-sm text-slate-300">${kit.id}</div><div class="text-[10px] text-slate-500 font-mono">${kit.line} | ${kit.createdDate}</div></div><div class="text-[10px] bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-500/30 h-fit">CLOSED</div>`;
        div.onclick = function() { showKitDetails(kit.id); };
        list.appendChild(div);
    });
}

function updateManagerDashboard() {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const fLine = document.getElementById('filterLine').value;
    
    // Filter Logs
    const logs = productionLogs.filter(l => {
        const dateMatch = (!start || l.date >= start) && (!end || l.date <= end);
        const lineMatch = fLine === 'All' || l.line === fLine;
        return dateMatch && lineMatch;
    });
    
    // Stats Calc
    let inp=0, pkd=0, rej=0, semi=0;
    logs.forEach(l => { inp+=l.input||0; pkd+=l.output||0; rej+=l.rejection||0; semi+=l.semi||0; });
    
    // DOM Updates
    document.getElementById('statInput').innerText = inp;
    document.getElementById('statPacked').innerText = pkd;
    document.getElementById('statRejection').innerText = rej;
    document.getElementById('statSemi').innerText = semi;
    
    // NEW CARDS CALCULATION
    const activeKitsFiltered = kits.filter(k => k.status === 'Active' && (fLine === 'All' || k.line === fLine));
    
    // Total Pending Rework (Sum of reworkQty from active kits)
    const totalReworkPending = activeKitsFiltered.reduce((sum, k) => sum + (k.reworkQty || 0), 0);
    document.getElementById('statReworkPending').innerText = totalReworkPending;

    // Total Remaining Qty (Sum of remainingQty from active kits)
    const totalRemaining = activeKitsFiltered.reduce((sum, k) => sum + (k.remainingQty || 0), 0);
    document.getElementById('statKitRemaining').innerText = totalRemaining;

    // Table Render
    const tbody = document.getElementById('reportTableBody'); tbody.innerHTML = '';
    if(logs.length===0) tbody.innerHTML = '<tr><td colspan="11" class="text-center p-4 opacity-50">No telemetry data found.</td></tr>';
    
    logs.forEach(l => {
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : 0;
        
        const efficiency = l.input > 0 ? (l.output / l.input) * 100 : 0;
        let rowClass = '';
        if(efficiency > 95) rowClass = 'row-excellent';
        else if(efficiency < 80 || (l.rejection > l.output * 0.1)) rowClass = 'row-poor';

        tbody.innerHTML += `<tr class="${rowClass} hover:bg-slate-800 transition">
            <td class="px-4 py-2">${l.date}</td>
            <td class="px-4">${l.line}</td>
            <td class="px-4">${l.pqc || '-'}</td> 
            <td class="px-4 font-bold text-white">${l.kitId}</td>
            <td class="px-4">${l.model}</td>
            <td class="px-4 text-right">${l.input||0}</td>
            <td class="px-4 text-right font-bold text-green-400">${l.output||0}</td>
            <td class="px-4 text-right text-red-400">${l.rejection||0}</td>
            <td class="px-4 text-right text-orange-400">${l.semi||0}</td>
            <td class="px-4 text-right text-purple-400">${l.rework||0}</td>
            <td class="px-4 text-right text-blue-400 font-bold">${rem}</td>
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
    link.download = "Closed_Kits_Archive.csv";
    link.click();
}

function exportManagerData() {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const fLine = document.getElementById('filterLine').value;
    const logs = productionLogs.filter(l => {
        const dateMatch = (!start || l.date >= start) && (!end || l.date <= end);
        const lineMatch = fLine === 'All' || l.line === fLine;
        return dateMatch && lineMatch;
    });

    if(logs.length === 0) { alert("No logs to export."); return; }
    let csv = "Date,Line,Leader,PQC,Kit ID,Model,Input Used,Packed,Rejection,Semi FG,Rework,Rem Kit,Remarks\n";
    logs.forEach(l => {
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : 0;
        csv += `${l.date},${l.line},${l.leader},${l.pqc||'-'},${l.kitId},${l.model},${l.input||0},${l.output||0},${l.rejection||0},${l.semi||0},${l.rework||0},${rem},${l.remarks||''}\n`;
    });
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = "Production_Logs_Full.csv";
    link.click();
}