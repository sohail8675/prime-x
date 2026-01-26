/* PRIME X v4.6 - STABLE FIXED (Buttons Restored) */
import { loginUser, logoutUser } from './auth.js';
import { db } from './firebase.js';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// STATE
let kits = [];
let productionLogs = [];
let currentUserRole = '';
let currentView = 'loginSection';
// NEW HELPER: Checks if kit is > 3 days old
function isKitPending(dateString) {
    if(!dateString) return false;
    const created = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays > 3; 
}

// HELPER
function getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function playSound(type) {
    const s = document.getElementById(type === 'success' ? 'soundSuccess' : 'soundError');
    if(s) { s.currentTime = 0; s.play().catch(()=>{}); }
}

// --- CORE FUNCTIONS ---
async function addProductionLog(logData) {
    await addDoc(collection(db, "productionLogs"), {
        ...logData,
        timestamp: serverTimestamp()
    });
    productionLogs.push(logData);
}

// --- NAVIGATION ---
window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    if(viewId === 'loginSection') {
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('header').classList.add('hidden');
        document.getElementById('mainContainer').classList.add('hidden');
    } else {
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('header').classList.remove('hidden');
        document.getElementById('mainContainer').classList.remove('hidden');
        const target = document.getElementById(viewId);
        if(target) target.classList.remove('hidden');
    }
    const menu = document.getElementById('sideMenu');
    if(!menu.classList.contains('-translate-x-full')) {
        menu.classList.add('-translate-x-full');
        document.getElementById('menuOverlay').classList.add('hidden');
    }
    currentView = viewId;
    if(viewId === 'activeUnitsView') renderSidebarKits();
    if(viewId === 'pendingUnitsView') renderPendingKits();
    if(viewId === 'archivedUnitsView') renderClosedKits();
    if(viewId === 'dashboardView' && (currentUserRole.includes('Manager') || currentUserRole.includes('Data'))) updateManagerDashboard();
}

// --- INIT ---
// --- INIT (COMPLETE & FIXED) ---
document.addEventListener('DOMContentLoaded', () => {

    // 1. Menu Toggles
    const menuBtn = document.getElementById('menuBtn');
    if(menuBtn) {
        menuBtn.addEventListener('click', () => {
            document.getElementById('sideMenu').classList.remove('-translate-x-full');
            document.getElementById('menuOverlay').classList.remove('hidden');
        });
    }
    
    const closeMenu = () => {
        document.getElementById('sideMenu').classList.add('-translate-x-full');
        document.getElementById('menuOverlay').classList.add('hidden');
    };
    document.getElementById('closeMenuBtn').addEventListener('click', closeMenu);
    document.getElementById('menuOverlay').addEventListener('click', closeMenu);

    // 2. Export Button Listener
    const expBtn = document.getElementById('exportArchiveBtn');
    if(expBtn) expBtn.addEventListener('click', exportClosedKits);

    // 3. Login Logic
    document.getElementById('firebaseLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const err = document.getElementById('loginErrorMsg');
        btn.disabled = true; btn.innerText = "Verifying...";
        
        try {
            const { role } = await loginUser(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            currentUserRole = role;
            
            const roleDisplay = document.getElementById('currentRoleDisplay');
            if(roleDisplay) roleDisplay.innerText = role;

            await initializeData();

            // Role Logic
            if(role === 'Manager' || role === 'Data Incharge') {
                switchView('dashboardView');
                if (role === 'Data Incharge') {
                    document.getElementById('addKitBtn').classList.remove('hidden');
                } else {
                    document.getElementById('addKitBtn').classList.add('hidden');
                }
            } else {
                switchView('activeUnitsView');
                document.getElementById('addKitBtn').classList.add('hidden');
            }

        } catch(error) {
            err.innerText = error.message; err.classList.remove('hidden');
        } finally {
            btn.disabled = false; btn.innerText = "LOG IN";
        }
    });

    // 4. Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await logoutUser(); location.reload();
    });

    // 5. Modals & Forms
    document.getElementById('addKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.remove('hidden'));
    document.getElementById('cancelAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('addKitForm').addEventListener('submit', handleAddKit);
    
    document.getElementById('cancelTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('transferForm').addEventListener('submit', handleTransferKit);
    
    // 6. Dashboard Filters
    document.getElementById('applyFilter').addEventListener('click', updateManagerDashboard);
    
    // 7. Active Units Filters
    ['sidebarFilterBtn','sidebarDateStart','sidebarDateEnd','sidebarTypeFilter','kitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search')?'keyup':'change', renderSidebarKits);
        }
    });

    // 8. Pending Units Filters
    ['pendingDateStart', 'pendingDateEnd', 'pendingLineFilter', 'pendingTypeFilter', 'pendingKitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search') ? 'keyup' : 'change', renderPendingKits);
        }
    });

    // 9. Closed Units Filters
    ['closedFilterBtn','closedDateStart','closedDateEnd','closedTypeFilter','closedKitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search')?'keyup':'change', renderClosedKits);
        }
    });

});

async function initializeData() {
    try {
        const kSnap = await getDocs(collection(db, "kits"));
        kits = []; kSnap.forEach(d => kits.push(d.data()));
        const lSnap = await getDocs(collection(db, "productionLogs"));
        productionLogs = []; lSnap.forEach(d => productionLogs.push(d.data()));
    } catch(e) { console.error(e); }
}

async function handleAddKit(e) {
    e.preventDefault();
    const id = document.getElementById('kitIdInput').value.toUpperCase().trim();
    if(kits.some(k => k.id === id)) return alert("ID Exists");
    
    const newKit = {
        id: id,
        createdDate: document.getElementById('kitDateInput').value || getLocalDateString(),
        model: document.getElementById('modelInput').value.toUpperCase(),
        totalQty: parseInt(document.getElementById('totalQtyInput').value),
        line: document.getElementById('issuedLineInput').value,
        type: document.getElementById('kitTypeInput').value, 
        linkedKits: document.getElementById('linkedKitsInput').value,
        usedQty:0, packedQty:0, rejectionQty:0, semiQty:0, reworkQty:0,
        remainingQty: parseInt(document.getElementById('totalQtyInput').value),
        status: 'Active', isTransferred: false, createdBy: currentUserRole
    };
    await setDoc(doc(db, "kits", id), { ...newKit, createdAt: serverTimestamp() });
    kits.push(newKit);
    document.getElementById('addKitModal').classList.add('hidden');
    renderSidebarKits();
}

function renderSidebarKits() {
    const list = document.getElementById('kitList');
    const term = document.getElementById('kitSearch').value.toLowerCase();
    const start = document.getElementById('sidebarDateStart').value;
    const end = document.getElementById('sidebarDateEnd').value;
    const line = document.getElementById('sidebarLineFilter').value;
    
    // NEW: Type Filter Value
    const type = document.getElementById('sidebarTypeFilter').value;

   const filtered = kits.filter(k => 
    k.status === 'Active' && 
    !isKitPending(k.createdDate) &&
    (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
    (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
    (!line || line === "All Lines" || k.line === line) &&
    (!type || type === "" || k.type === type) // <--- NEW CHECK
);
    list.innerHTML = '';
    if(!filtered.length) list.innerHTML = '<div class="text-slate-500 text-center text-xs p-4">No units found.</div>';

    filtered.forEach(k => {
        const div = document.createElement('div');
        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        const lineShort = k.line.replace('Line ','L').trim();
        const rate = k.packedQty>0 ? (k.rejectionQty/(k.packedQty+k.rejectionQty))*100 : 0;
        let grade = rate < 2 ? 'A' : (rate < 5 ? 'B' : 'C');

        div.className = `kit-item group ${k.isTransferred?'is-transferred':''} ${k.type === 'Final Unit' ? 'is-final' : ''}`;
              div.innerHTML = `
            ${k.isTransferred ? '<div class="transferred-badge">TR</div>' : ''}
            <div class="grade-badge grade-${grade}">${grade}</div>
            <div class="flex items-center gap-3 mb-2">
                <div class="line-avatar">${lineShort}</div>
                <div>
                    <div class="font-bold text-sm text-slate-200">${k.id}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${k.model}</div>
                    <div class="text-[10px] text-cyan-400 font-bold mt-1"><i class="fas fa-industry"></i> ${k.line}</div>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2">
                <div class="mini-stat">In <b>${k.totalQty}</b></div>
                <div class="mini-stat">Pk <b class="text-green-400">${k.packedQty}</b></div>
                <div class="mini-stat">Rem <b class="${rem < 0 ? 'text-red-400':'text-cyan-400'}">${rem}</b></div>
            </div>
        `;
        div.onclick = () => openKitAction(k);
        list.appendChild(div);
    });
}

function openKitAction(kit) {
    const container = document.getElementById('dynamicDetailsContainer');
    container.innerHTML = '';

    let element; 

    // 1. Template Load karo
    if(currentUserRole === 'Manager' || currentUserRole === 'Data Incharge') {
        const tmpl = document.getElementById('kitDetailTemplate').cloneNode(true);
        tmpl.classList.remove('hidden');
        element = tmpl.firstElementChild;
        renderManagerDetailCard(kit, element);
    } else {
        const tmpl = document.getElementById('lineLeaderFormTemplate').cloneNode(true);
        tmpl.classList.remove('hidden');
        element = tmpl.firstElementChild;
        setupLeaderForm(kit, element);
    }

    // ----------------------------------------------------
    // 🎨 PAINT JOB (COLOR LOGIC)
    // ----------------------------------------------------
    
    // Step A: Purani halki/transparent classes hatao
    element.classList.remove('bg-dark/60', 'bg-dark/40', 'backdrop-blur-xl', 'border-white/10');

    // Step B: Special Treatment Check karo
    if(kit.type === 'Final Unit') {
        // ✨ FINAL UNIT = SPECIAL GOLD LOOK
        // Solid Dark Background + Gold Border + Gold Glow
        element.className += " bg-[#0f172a] border-2 border-yellow-500 shadow-[0_0_40px_rgba(234,179,8,0.15)] rounded-2xl p-6";
    } else {
        // ⚙️ NORMAL PART = SOLID DARK LOOK
        // Solid Dark Background + Standard Border (Koi transparency nahi)
        element.className += " bg-[#0f172a] border border-slate-700 shadow-2xl rounded-2xl p-6";
    }
    // ----------------------------------------------------

    container.appendChild(element);
    switchView('detailsView');
}

function renderManagerDetailCard(kit, card) {
    // Sirf is kit ke logs uthao
    const logs = productionLogs.filter(l => l.kitId === kit.id).reverse();
    
    // Progress Bar Calcs
    const totalDone = kit.packedQty + kit.rejectionQty;
    const progress = Math.min((totalDone/kit.totalQty)*100, 100);
    const currentRem = kit.totalQty - totalDone;
    
    // Date Logic
    let dateDisplayHtml = '';
    if (kit.status === 'Closed') {
        const start = new Date(kit.createdDate);
        const end = kit.closedDate ? new Date(kit.closedDate) : new Date(); 
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const totalDays = diffDays === 0 ? 1 : diffDays;

        dateDisplayHtml = `
            <div class="flex items-center gap-2 text-[10px] bg-slate-900/80 p-1.5 rounded-lg border border-white/10 mt-1">
                <span class="text-slate-500">${kit.createdDate}</span>
                <i class="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                <span class="text-yellow-400 font-bold bg-yellow-900/20 px-1 rounded border border-yellow-500/30">${totalDays} Days</span>
                <i class="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                <span class="text-slate-500">${kit.closedDate || 'Today'}</span>
            </div>
        `;
    } else {
        dateDisplayHtml = `<span class="text-[10px] text-slate-500"><i class="far fa-calendar-alt ml-1"></i> ${kit.createdDate}</span>`;
    }

    // Badge Logic
    const typeBadge = kit.type === 'Final Unit' 
        ? '<span class="bg-green-900/50 text-green-400 px-2 rounded text-[10px] border border-green-500/30">FINAL</span>' 
        : '<span class="bg-yellow-900/50 text-yellow-400 px-2 rounded text-[10px] border border-yellow-500/30">PART</span>';
    
    // Buttons Logic
    const isComplete = totalDone >= kit.totalQty;
    let closeBtn = kit.status === 'Closed' 
        ? `<button class="flex-1 bg-slate-800 text-slate-500 py-2 rounded text-xs cursor-default">Completed & Locked</button>`
        : (isComplete 
            ? `<button onclick="closeKitAction('${kit.id}')" class="flex-1 bg-emerald-600/20 text-emerald-400 py-2 rounded text-xs border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition font-bold"><i class="fas fa-check-circle mr-1"></i> Mark as Completed</button>` 
            : `<button class="flex-1 bg-slate-800 text-slate-600 py-2 rounded text-xs cursor-not-allowed" disabled>Incomplete</button>`);

    const transferBtn = kit.status === 'Closed' 
        ? '' 
        : `<button onclick="initTransfer('${kit.id}')" class="flex-1 bg-orange-600/20 text-orange-400 py-2 rounded text-xs border border-orange-500/30 hover:bg-orange-600 hover:text-white transition">Transfer</button>`;

    // --- TABLE GENERATION START ---
    let table = `
    <table class="w-full text-[10px] text-left text-slate-300 mt-4 table-fixed">
        <thead class="bg-slate-900 sticky top-0">
            <tr>
                <th class="p-2 w-20">DATE</th>
                <th class="p-2 text-center">INPUT</th>
                <th class="p-2 text-center text-green-400">FINAL</th>
                <th class="p-2 text-center text-orange-400">SEMI</th>
                <th class="p-2 text-center text-purple-400">REWORK</th>
                <th class="p-2 text-center text-cyan-400">REM</th>
                <th class="p-2 text-right text-red-400">REJ</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-white/5">`;

    logs.forEach(l => {
        // 🔥 MAGIC FIX: Agar Transfer entry hai (Leader = System), to special row dikhao
        if (l.leader === 'System' || (l.remarks && l.remarks.includes('Transferred'))) {
            table += `
            <tr class="bg-orange-900/20 border-l-2 border-orange-500">
                <td class="p-2 text-orange-400 font-mono align-top">${l.date}</td>
                <!-- colspan="6" ka matlab baaki ke saare columns merge karke message dikhao -->
                <td colspan="6" class="p-2 text-left text-orange-200 italic tracking-wide align-middle">
                    <i class="fas fa-exchange-alt mr-2"></i> ${l.remarks}
                </td>
            </tr>`;
        } else {
            // Normal Row
            table += `
            <tr class="hover:bg-white/5 transition">
                <td class="p-2 truncate">${l.date}</td>
                <td class="p-2 text-center text-slate-400">${l.input||0}</td>
                <td class="p-2 text-center text-green-400 font-bold">${l.output||0}</td>
                <td class="p-2 text-center text-orange-400">${l.semi||0}</td>
                <td class="p-2 text-center text-purple-400">${l.rework||0}</td>
                <td class="p-2 text-center text-cyan-400 font-mono">${currentRem}</td>
                <td class="p-2 text-right text-red-400 font-bold">${l.rejection||0}</td>
            </tr>`;
        }
    });
    table += '</tbody></table>';
    // --- TABLE GENERATION END ---

    card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div>
                <h3 class="text-3xl font-bold text-white tracking-tight">${kit.id}</h3>
                <div class="flex flex-col gap-1 mt-1">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-mono text-slate-400 bg-slate-800 px-1 rounded">${kit.model}</span>
                        <span class="text-xs font-bold text-cyan-400 bg-cyan-900/20 px-2 rounded border border-cyan-500/30">
                            <i class="fas fa-industry mr-1"></i> ${kit.line}
                        </span>
                    </div>
                    ${dateDisplayHtml}
                </div>
            </div>
            <div class="text-right space-y-1">
                ${typeBadge}
                <div class="text-[10px] text-slate-500 uppercase tracking-widest">${kit.status}</div>
            </div>
        </div>

        <div class="w-full bg-slate-800 h-2 rounded-full mb-6 overflow-hidden border border-white/5">
            <div class="bg-gradient-to-r from-blue-500 to-cyan-400 h-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" style="width:${progress}%"></div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center mb-6">
            <div class="bg-slate-800/80 p-2 rounded border border-white/5 relative group">
                ${kit.status === 'Active' ? `<button onclick="editKitTotal('${kit.id}', ${kit.totalQty})" class="absolute top-1 right-1 text-slate-600 hover:text-blue-400"><i class="fas fa-edit text-[10px]"></i></button>` : ''}
                <p class="text-[10px] text-slate-400 uppercase">Total</p>
                <b class="text-white text-lg">${kit.totalQty}</b>
            </div>
            <div class="bg-slate-800/80 p-2 rounded border border-white/5"><p class="text-[10px] text-slate-400 uppercase">Input</p><b class="text-slate-200 text-lg">${kit.usedQty || 0}</b></div>
            <div class="bg-slate-800/80 p-2 rounded border border-green-500/20"><p class="text-[10px] text-slate-400 uppercase">Packed</p><b class="text-green-400 text-lg">${kit.packedQty}</b></div>
            <div class="bg-slate-800/80 p-2 rounded border border-orange-500/20"><p class="text-[10px] text-slate-400 uppercase">Semi FG</p><b class="text-orange-400 text-lg">${kit.semiQty || 0}</b></div>
            <div class="bg-slate-800/80 p-2 rounded border border-purple-500/20"><p class="text-[10px] text-slate-400 uppercase">Rework</p><b class="text-purple-400 text-lg">${kit.reworkQty || 0}</b></div>
            <div class="bg-slate-800/80 p-2 rounded border border-red-500/20"><p class="text-[10px] text-slate-400 uppercase">Reject</p><b class="text-red-400 text-lg">${kit.rejectionQty}</b></div>
        </div>

        <div class="bg-slate-900/50 p-3 rounded-xl border border-white/10 flex justify-between items-center mb-4">
            <span class="text-xs text-slate-400 font-bold uppercase">Balance Remaining</span>
            <span class="text-2xl font-mono font-bold text-cyan-400">${currentRem}</span>
        </div>
        
        <div class="flex gap-2 mb-4">
             ${transferBtn}
             <button onclick="shareKitWhatsApp('${kit.id}')" class="flex-1 bg-green-900/20 text-green-400 py-2 rounded text-xs border border-green-500/30 hover:bg-green-600 hover:text-white transition font-bold flex items-center justify-center gap-2">
                 <i class="fab fa-whatsapp text-lg"></i> Share
             </button>
             ${closeBtn}
        </div>

        <div class="mt-4 pt-4 border-t border-white/5">
            <p class="text-[10px] text-slate-500 mb-2 uppercase font-bold">Production History</p>
            <div class="overflow-y-auto max-h-40 custom-scrollbar border border-white/5 rounded bg-darker/30">
                ${table}
            </div>
        </div>
    `;
}


function setupLeaderForm(kit, formContainer) {
    const form = formContainer.querySelector('form');
    form.querySelector('[name="entryDate"]').value = getLocalDateString();
    // Locking Data:
    form.querySelector('[name="kitIdDisplay"]').value = kit.id;     // Kit ID set kiya
    form.querySelector('[name="modelDisplay"]').value = kit.model;  // Model set kiya
    form.querySelector('[name="lineSelect"]').value = kit.line;     // Line set kiya (Ab ye change nahi hoga)

    const inputs = form.querySelectorAll('.calc-input');
    inputs.forEach(inp => {
        inp.addEventListener('input', () => {
             const i = parseInt(form.querySelector('[name="inputUsed"]').value)||0;
             const o = parseInt(form.querySelector('[name="outputQty"]').value)||0;
             const r = parseInt(form.querySelector('[name="rejectionQty"]').value)||0;
             const s = parseInt(form.querySelector('[name="semiQty"]').value)||0;
             const w = parseInt(form.querySelector('[name="reworkQty"]').value)||0;
             const diff = i - (o+r+s+w);
             const helper = form.querySelector('.calc-helper');
             helper.classList.remove('hidden');
             helper.querySelector('.calc-diff').innerText = diff;
             helper.className = diff < 0 ? 'md:col-span-2 p-2 rounded text-xs bg-red-900/20 text-red-400 calc-helper' : 'md:col-span-2 p-2 rounded text-xs bg-blue-900/20 text-blue-400 calc-helper';
        });
    });

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true; btn.innerText = "Syncing...";
        try {
            const log = {
                date: form.querySelector('[name="entryDate"]').value,
                line: form.querySelector('[name="lineSelect"]').value,
                leader: form.querySelector('[name="leaderName"]').value,
                pqc: form.querySelector('[name="pqcSelect"]').value,
                kitId: kit.id, model: kit.model,
                input: parseInt(form.querySelector('[name="inputUsed"]').value)||0,
                output: parseInt(form.querySelector('[name="outputQty"]').value)||0,
                rejection: parseInt(form.querySelector('[name="rejectionQty"]').value)||0,
                semi: parseInt(form.querySelector('[name="semiQty"]').value)||0,
                rework: parseInt(form.querySelector('[name="reworkQty"]').value)||0,
                remarks: form.querySelector('[name="remarksInput"]').value
            };
            
            if(log.input < (log.output+log.rejection+log.semi+log.rework)) {
                throw new Error("Output exceeds Input!");
            }

            await addProductionLog(log);
            
            const newPacked = kit.packedQty + log.output;
            const newRej = kit.rejectionQty + log.rejection;
            await updateDoc(doc(db, "kits", kit.id), {
                packedQty: newPacked, rejectionQty: newRej, usedQty: kit.usedQty+log.input,
                semiQty: kit.semiQty+log.semi, reworkQty: kit.reworkQty+log.rework
            });
            
            kit.packedQty = newPacked; kit.rejectionQty = newRej;
            playSound('success');
                                // --- 🟢 UPDATED WHATSAPP PATCH (With Remaining) ---
            
            // 1. Remaining Calculate karo (Total - (Packed + Reject))
            const currentRem = kit.totalQty - (kit.packedQty + kit.rejectionQty);

            // 2. Button dhundo
            const waBtn = document.getElementById('whatsappShareBtn');
            
            // 3. Message banao (Ab Remaining bhi hai isme)
            const msg = `*📢 PRODUCTION ENTRY | ${log.line}*\n` +
                        `-----------------------------\n` +
                        `👤 *Leader:* ${log.leader}\n` +
                        `🛡️ *PQC:* ${log.pqc}\n` +
                        `📦 *Kit:* ${log.kitId} (${log.model})\n` +
                        `-----------------------------\n` +
                        `📥 *Input:* ${log.input}\n` +
                        `✅ *Packed:* ${log.output}\n` +
                        `⚠️ *Reject:* ${log.rejection}\n` +
                        `🟠 *Semi:* ${log.semi}\n` +
                        `🟣 *Rework:* ${log.rework}\n` +
                        `-----------------------------\n` +
                        `🔵 *REMAINING:* ${currentRem}\n` +  // <--- YE ADD KIYA HAI
                        `-----------------------------\n` +
                        `📝 *Note:* ${log.remarks}\n` +
                        `_Sent via Prime X OS_`;

            // 4. Click Action
            waBtn.onclick = function() {
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            };
            // --- 🔴 END PATCH ---

            document.getElementById('resInput').innerText = log.input;
            document.getElementById('resOutput').innerText = log.output;
            document.getElementById('resRej').innerText = log.rejection;
            document.getElementById('resultModal').classList.remove('hidden');
            switchView('activeUnitsView');
        } catch(err) {
            playSound('error'); alert(err.message);
        } finally {
            btn.disabled = false; btn.innerText = "Commit Data";
        }
    };
}

// --- FIXED MANAGER DASHBOARD ---
function updateManagerDashboard() {
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const line = document.getElementById('filterLine').value;

    const logs = productionLogs.filter(l => 
        (!start || l.date >= start) && (!end || l.date <= end) &&
        (!line || line === "All" || l.line === line)
    );

    let inp=0, finalPacked=0, rej=0, semi=0, rwPending=0, totalRem=0;

    // 1. Logs Loop (Sab Output ko 'FinalPacked' mein jod rahe hain)
    logs.forEach(l => {
        inp += l.input || 0;
        finalPacked += l.output || 0; // Ab Part ho ya Final, sab yahan judega
        rej += l.rejection || 0; 
        semi += l.semi || 0;
    });

    // 2. Active Kits Loop (Rework aur Remaining ke liye)
    kits.filter(k => k.status === 'Active' && (!line || line === "All" || k.line === line)).forEach(k => {
        rwPending += k.reworkQty || 0;
        totalRem += (k.totalQty - (k.packedQty + k.rejectionQty));
    });

    // 3. Update Cards
    document.getElementById('statInput').innerText = inp;
    document.getElementById('statPacked').innerText = finalPacked;
    document.getElementById('statRejection').innerText = rej;
    document.getElementById('statSemi').innerText = semi;
    document.getElementById('statReworkPending').innerText = rwPending;
    
    // Kit Remaining Card Update
    const remEl = document.getElementById('statKitRemaining');
    if(remEl) remEl.innerText = totalRem;
    
    // 4. Update Table
    const tbody = document.getElementById('reportTableBody'); 
    tbody.innerHTML='';
    
    logs.slice(0,50).forEach(l => {
        const k = kits.find(kt => kt.id === l.kitId);
        const rem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : '?';
        
        tbody.innerHTML += `
            <tr class="hover:bg-white/5 transition">
                <td class="px-4 py-2">${l.date}</td>
                <td class="px-4">${l.line}</td>
                <td class="px-4 font-bold text-white">${l.kitId}</td>
                <td class="px-4">${l.model}</td>
                <td class="px-4 text-right font-mono">${l.input || 0}</td>
                <td class="px-4 text-right font-mono text-green-400">${l.output || 0}</td>
                <td class="px-4 text-right font-mono text-orange-400">${l.semi || 0}</td>
                <td class="px-4 text-right font-mono text-purple-400">${l.rework || 0}</td>
                <td class="px-4 text-right font-mono text-cyan-400 font-bold">${rem}</td>
                <td class="px-4 text-right font-mono text-red-400">${l.rejection || 0}</td> 
            </tr>`;
    });
}
function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const term = document.getElementById('closedKitSearch').value.toLowerCase();
    const start = document.getElementById('closedDateStart').value;
    const end = document.getElementById('closedDateEnd').value;
    const line = document.getElementById('closedLineFilter').value;
    
    // NEW: Type Filter
    const type = document.getElementById('closedTypeFilter').value;

    const closed = kits.filter(k => 
        k.status === 'Closed' && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "All Lines" || k.line === line) &&
        (!type || type === "" || k.type === type) // <--- NEW CHECK
    );

    list.innerHTML = '';
    
    if (closed.length === 0) {
        list.innerHTML = '<div class="text-slate-500 text-center text-xs p-4">No closed kits found.</div>';
        return;
    }

    closed.forEach(k => {
        const div = document.createElement('div');
        div.className = `kit-item flex justify-between items-center bg-slate-800/50 p-3 rounded mb-2 border border-white/5 hover:border-blue-500/50 cursor-pointer ${k.isTransferred ? 'is-transferred' : ''} ${k.type === 'Final Unit' ? 'is-final' : ''}`;
        div.innerHTML = `
            ${k.isTransferred ? '<div class="transferred-badge">TR</div>' : ''}
            <div>
                <div class="font-bold text-white text-sm">${k.id}</div>
                <div class="text-xs text-slate-400 font-mono">${k.model}</div>
                <div class="text-[10px] text-cyan-400 font-bold mt-1"><i class="fas fa-check-circle"></i> ${k.line}</div>
            </div>
            <div class="text-right">
                <div class="text-[10px] text-slate-500">${k.createdDate}</div>
                <div class="text-xs font-bold text-green-400">Pk: ${k.packedQty}</div>
            </div>`;
        div.onclick = () => openKitAction(k);
        list.appendChild(div);
    });
}


// --- FIXED TRANSFER FUNCTION ---
async function handleTransferKit(e) {
    e.preventDefault(); // Page reload rokne ke liye
    
    // 1. Data Uthana
    const btn = document.getElementById('transferForm').querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        const id = document.getElementById('transferKitId').value;
        const targetLine = document.getElementById('transferTo').value;
        const qty = parseInt(document.getElementById('transferQty').value);
        const remarks = document.getElementById('transferRemarks').value;

        // 2. Validation
        if(!targetLine) throw new Error("Select a Target Line");
        if(isNaN(qty) || qty <= 0) throw new Error("Enter valid Quantity");

        const k = kits.find(x => x.id === id);
        const currentRem = k.totalQty - (k.packedQty + k.rejectionQty);

        if(qty > currentRem) throw new Error(`Cannot transfer ${qty}. Only ${currentRem} remaining.`);

        // 3. New Kit Creation (TR wali)
        const newId = `${id}-TR-${Math.floor(Math.random()*1000)}`; // Unique ID
        
        const newKit = { 
            ...k, 
            id: newId, 
            totalQty: qty, 
            remainingQty: qty, 
            packedQty: 0, 
            rejectionQty: 0, 
            usedQty: 0, 
            semiQty: 0, 
            reworkQty: 0,
            line: targetLine, 
            isTransferred: true, 
            createdDate: getLocalDateString(),
            createdBy: 'Transfer System' 
        };
        
        // 4. Update Database
        // Purani kit ka total kam karna
        await updateDoc(doc(db,"kits",id), { totalQty: k.totalQty - qty });
        // Nayi kit banana
        await setDoc(doc(db,"kits",newId), newKit);
        
        // Log Entry
        await addProductionLog({ 
            date: getLocalDateString(), 
            line: k.line, 
            leader: "System", 
            kitId: id, 
            model: k.model, 
            input: 0, output: 0, rejection:0, 
            remarks: `Transferred ${qty} to ${targetLine} (${newId}). Note: ${remarks}` 
        });

        alert("Transfer Successful!");
        document.getElementById('transferModal').classList.add('hidden');
        location.reload(); // Refresh taaki naya data dikhe

    } catch(err) {
        alert(err.message);
    } finally {
        btn.disabled = false; btn.innerText = originalText;
    }
}
// --- FIXED EXPORT FUNCTION ---
function exportManagerData() {
    let csv = "Date,Line,Kit,Model,Input,Output,Semi,Rework,Rejection\n" + 
    productionLogs.map(l => 
        `${l.date},${l.line},${l.kitId},${l.model},${l.input},${l.output},${l.semi||0},${l.rework||0},${l.rejection}`
    ).join("\n");
    const link = document.createElement("a"); link.href = "data:text/csv;charset=utf-8," + encodeURI(csv); link.download = "PrimeX_Logs.csv"; link.click();
}
// --- FIXED EXPORT FUNCTION (A to Z Details) ---
async function exportClosedKits() {
    console.log("Export started..."); // Debugging ke liye

    // 1. Data Check
    const closed = kits.filter(k => k.status === 'Closed');
    if (closed.length === 0) {
        alert("No closed kits found to export!");
        return;
    }

    // 2. Button ko feedback dene ke liye (Optional)
    const btn = document.getElementById('exportArchiveBtn');
    const oldText = btn.innerHTML;
    btn.innerText = "Downloading...";

    try {
        // 3. CSV Header
        let csv = "Kit ID,Model,Line,Start Date,Close Date,Duration (Days),Last Leader,Last PQC,Total Order Qty,Total Input,Final Packed,Rejection,Semi FG,Rework Pending,Status\n";

        // 4. Data Loop
        const rows = closed.map(k => {
            // Duration Calc
            let duration = "1";
            if (k.createdDate && k.closedDate) {
                const start = new Date(k.createdDate);
                const end = new Date(k.closedDate);
                const diffTime = Math.abs(end - start);
                duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if(duration === 0) duration = 1;
            }

            // Logs Check for Leader/PQC
            // Hum productionLogs array se filter kar rahe hain
            const myLogs = productionLogs.filter(l => l.kitId === k.id);
            let lastLeader = "N/A";
            let lastPQC = "N/A";
            
            if (myLogs.length > 0) {
                // Last entry uthao
                const lastLog = myLogs[myLogs.length - 1]; 
                lastLeader = lastLog.leader || "N/A";
                lastPQC = lastLog.pqc || "N/A";
            }

            // Row Generate
            return `${k.id},${k.model},${k.line},${k.createdDate},${k.closedDate || 'N/A'},${duration} Days,${lastLeader},${lastPQC},${k.totalQty},${k.usedQty || 0},${k.packedQty},${k.rejectionQty},${k.semiQty || 0},${k.reworkQty || 0},Closed`;
        });

        csv += rows.join("\n");

        // 5. Download
        const link = document.createElement("a");
        link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
        link.download = `PrimeX_Archive_Full_${getLocalDateString()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error(err);
        alert("Error exporting data. Check console.");
    } finally {
        btn.innerHTML = oldText; // Button wapas normal karo
    }
}

// --- NEW EDIT FUNCTION ---
window.editKitTotal = async function(id, currentQty) {
    const newQty = prompt(`Update Total Qty for ${id}:`, currentQty);
    if (newQty === null || newQty === "") return;
    const parsedQty = parseInt(newQty);
    if (isNaN(parsedQty) || parsedQty <= 0) { alert("Please enter a valid number!"); return; }

    if (confirm(`Change Total Qty from ${currentQty} to ${parsedQty}?`)) {
        try {
            await updateDoc(doc(db, "kits", id), { totalQty: parsedQty, remainingQty: parsedQty });
            const kit = kits.find(k => k.id === id);
            if(kit) { kit.totalQty = parsedQty; kit.remainingQty = parsedQty; }
            alert("Quantity Updated!");
            const container = document.getElementById('dynamicDetailsContainer');
            if(container) { renderManagerDetailCard(kit, container.firstElementChild); }
        } catch(e) { console.error(e); alert("Error updating quantity"); }
    }
}

// --- WHATSAPP SHARE FUNCTION ---
window.shareKitWhatsApp = function(id) {
    const k = kits.find(x => x.id === id);
    if(!k) return;
    
    const rem = k.totalQty - (k.packedQty + k.rejectionQty);
    
    // Message Format
    const text = `*PRIME X - AVTIVE KIT* 🚀\n--------------------------------\n📦 *Kit ID:* ${k.id}\n🏭 *Line:* ${k.line}\n🗓 *Date:* ${k.createdDate}\n🔖 *Model:* ${k.model}\n--------------------------------\n🔢 *Total Qty:* ${k.totalQty}\n📥 *Input:* ${k.usedQty || 0}\n\n✅ *FINAL PACKED:* ${k.packedQty}\n⚠️ *Rejection:* ${k.rejectionQty}\n🟠 *Semi FG:* ${k.semiQty || 0}\n🟣 *Rework:* ${k.reworkQty || 0}\n--------------------------------\n🔵 *REMAINING:* ${rem}\n--------------------------------\n_Generated via Prime X OS_`;

    // Open WhatsApp
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}
// --- NEW UPDATED FUNCTION WITH DATE & LINE FILTER ---
// --- UPDATED PENDING KITS FUNCTION (Clean Look) ---
function renderPendingKits() {
    const list = document.getElementById('pendingKitList');
    
    // Inputs
    const term = document.getElementById('pendingKitSearch').value.toLowerCase();
    const start = document.getElementById('pendingDateStart').value;
    const end = document.getElementById('pendingDateEnd').value;
    const line = document.getElementById('pendingLineFilter').value;
    
    // NEW: Type Filter
    const type = document.getElementById('pendingTypeFilter').value;

    // Filter Logic
    const filtered = kits.filter(k => 
        k.status === 'Active' && 
        isKitPending(k.createdDate) && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "All Lines" || k.line === line) &&
        (!type || type === "" || k.type === type) // <--- NEW CHECK
    );

    list.innerHTML = '';
    if(!filtered.length) list.innerHTML = '<div class="text-slate-500 text-center text-xs p-4">No pending records found.</div>';

    filtered.forEach(k => {
        const div = document.createElement('div');
        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        const lineShort = k.line.replace('Line ','L').trim();
        
        div.className = `kit-item group ${k.isTransferred?'is-transferred':''} ${k.type === 'Final Unit' ? 'is-final' : ''}`;
        
        div.innerHTML = `
            ${k.isTransferred ? '<div class="transferred-badge">TR</div>' : ''}
            <div class="absolute top-0 left-0 bg-orange-500 text-white text-[8px] px-1 font-bold rounded-br">PENDING</div>
            
            <div class="flex items-center gap-3 mb-2 pt-2">
                <div class="line-avatar bg-orange-900/20 text-orange-400 border-orange-500/30">${lineShort}</div>
                <div>
                    <div class="font-bold text-sm text-slate-200">${k.id}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${k.model}</div> 
                </div>
            </div>
            <div class="grid grid-cols-3 gap-1 border-t border-white/5 pt-2">
                <div class="mini-stat">Date <b>${k.createdDate}</b></div>
                <div class="mini-stat">Pk <b class="text-green-400">${k.packedQty}</b></div>
                <div class="mini-stat">Rem <b class="text-cyan-400">${rem}</b></div>
            </div>
        `;
        div.onclick = () => openKitAction(k);
        list.appendChild(div);
    });
}
    


// Enable Search for Pending
const pSearch = document.getElementById('pendingKitSearch');
if(pSearch) pSearch.addEventListener('keyup', renderPendingKits);
// --- NEW EXPORT FUNCTION FOR PENDING KITS (With Leader & PQC) ---
window.exportPendingKits = function() {
    // 1. Pending Kits filter karein
    const pending = kits.filter(k => k.status === 'Active' && isKitPending(k.createdDate));

    if (pending.length === 0) {
        alert("No pending kits to export!");
        return;
    }

    // 2. CSV Header (Jo column chahiye wo yahan hain)
    let csv = "Created Date,Line,Kit ID,Model,Last Leader,Last PQC,Total Qty,Input,Final Pack,Rejection,Semi FG,Rework,Remaining\n";

    // 3. Loop through kits and find details
    pending.forEach(k => {
        // Kit ka Remaining calculate karein
        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        
        // Logs check karke Last Leader aur PQC dhundein
        // Hum saare logs filter karenge jo is Kit ID ke hain
        const kitLogs = productionLogs.filter(l => l.kitId === k.id);
        
        // Agar logs hain, to sabse latest wala uthayenge
        let lastLeader = "N/A";
        let lastPQC = "N/A";
        
        if (kitLogs.length > 0) {
            // Logs ko date ke hisaab se sort karein (Newest first) - assuming logs are pushed chronologically
            // Ya agar timestamp hai to usse sort karein. Simple array reverse usually works if pushed in order.
            const latestLog = kitLogs[kitLogs.length - 1]; 
            lastLeader = latestLog.leader || "N/A";
            lastPQC = latestLog.pqc || "N/A";
        }

        // CSV Row banana
        csv += `${k.createdDate},${k.line},${k.id},${k.model},${lastLeader},${lastPQC},${k.totalQty},${k.usedQty || 0},${k.packedQty},${k.rejectionQty},${k.semiQty || 0},${k.reworkQty || 0},${rem}\n`;
    });

    // 4. Download Trigger karein
    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Pending_Kits_Report_${getLocalDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// --- MISSING BUTTON ACTIONS RESTORED ---

// 1. Transfer Modal Open karne wala function
window.initTransfer = function(id) {
    const k = kits.find(x => x.id === id);
    if(!k) return;
    
    // Modal ke inputs bharo
    document.getElementById('transferKitId').value = k.id;
    document.getElementById('transferFrom').value = k.line;
    document.getElementById('transferQty').value = ''; // Reset Qty
    document.getElementById('transferRemarks').value = ''; // Reset Remarks
    
    // Modal dikhao
    document.getElementById('transferModal').classList.remove('hidden');
}

// 2. Kit ko Close/Complete karne wala function
window.closeKitAction = async function(id) {
    if(!confirm("⚠️ Are you sure you want to CLOSE this kit?\nIt will be moved to Closed Kits archive.")) return;

    try {
        // Firebase Update
        await updateDoc(doc(db, "kits", id), {
            status: 'Closed',
            closedDate: getLocalDateString()
        });

        // Local Data Update
        const k = kits.find(x => x.id === id);
        if(k) {
            k.status = 'Closed';
            k.closedDate = getLocalDateString();
        }

        alert("Kit Closed Successfully!");
        
        // View Refresh karo
        renderSidebarKits(); // List se hat jayega
        document.getElementById('dynamicDetailsContainer').innerHTML = ''; // Details clear
        switchView('activeUnitsView'); // Wapas list pe jao

    } catch(e) {
        console.error(e);
        alert("Error closing kit: " + e.message);
    }
}