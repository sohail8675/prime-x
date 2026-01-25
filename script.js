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
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('menuBtn').addEventListener('click', () => {
        document.getElementById('sideMenu').classList.remove('-translate-x-full');
        document.getElementById('menuOverlay').classList.remove('hidden');
    });
    document.getElementById('closeMenuBtn').addEventListener('click', () => {
        document.getElementById('sideMenu').classList.add('-translate-x-full');
        document.getElementById('menuOverlay').classList.add('hidden');
    });
    document.getElementById('menuOverlay').addEventListener('click', () => {
        document.getElementById('sideMenu').classList.add('-translate-x-full');
        document.getElementById('menuOverlay').classList.add('hidden');
    });

    document.getElementById('firebaseLoginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const err = document.getElementById('loginErrorMsg');
        btn.disabled = true; btn.innerText = "Verifying...";
        try {
            const { role } = await loginUser(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
            currentUserRole = role;
            document.getElementById('currentRoleDisplay').innerText = role;
            await initializeData();
            if(role === 'Manager' || role === 'Data Incharge') {
                switchView('dashboardView');
                document.getElementById('addKitBtn').classList.remove('hidden');
            } else {
                switchView('activeUnitsView');
                document.getElementById('addKitBtn').classList.add('hidden');
            }
        } catch(error) {
            err.innerText = error.message; err.classList.remove('hidden');
        } finally {
            btn.disabled = false; btn.innerText = "LOG IN";
        }
       // --- LISTENERS FOR PENDING KITS FILTER ---
    ['pendingDateStart', 'pendingDateEnd', 'pendingLineFilter', 'pendingKitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search') ? 'keyup' : 'change', renderPendingKits);
        }
    });
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await logoutUser(); location.reload();
    });

    document.getElementById('addKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.remove('hidden'));
    document.getElementById('cancelAddKitBtn').addEventListener('click', () => document.getElementById('addKitModal').classList.add('hidden'));
    document.getElementById('addKitForm').addEventListener('submit', handleAddKit);
    document.getElementById('cancelTransferBtn').addEventListener('click', () => document.getElementById('transferModal').classList.add('hidden'));
    document.getElementById('transferForm').addEventListener('submit', handleTransferKit);
    
    document.getElementById('applyFilter').addEventListener('click', updateManagerDashboard);
    
    ['sidebarFilterBtn','sidebarDateStart','sidebarDateEnd','kitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search')?'keyup':'click', renderSidebarKits);
            if(id.includes('Date')) el.addEventListener('change', renderSidebarKits);
        }
    });
    ['closedFilterBtn','closedDateStart','closedDateEnd','closedKitSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search')?'keyup':'click', renderClosedKits);
            if(id.includes('Date')) el.addEventListener('change', renderClosedKits);
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

   const filtered = kits.filter(k => 
    k.status === 'Active' && 
    !isKitPending(k.createdDate) && // <--- YE LINE MAGIC KAREGI
    (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
    (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
    (!line || line === "All Lines" || k.line === line)
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
    const logs = productionLogs.filter(l => l.kitId === kit.id).reverse();
    const totalDone = kit.packedQty + kit.rejectionQty;
    const progress = Math.min((totalDone/kit.totalQty)*100, 100);
    const currentRem = kit.totalQty - totalDone;
    
    // --- 🟢 NEW LOGIC: DATE CALCULATION START ---
    let dateDisplayHtml = '';
    
    if (kit.status === 'Closed') {
        // Agar Closed hai, to Duration calculate karo
        // Note: Agar purani kit mein closedDate nahi hai to hum aaj ki date maan lenge display ke liye
        const start = new Date(kit.createdDate);
        const end = kit.closedDate ? new Date(kit.closedDate) : new Date(); 
        
        // Time Difference nikalna
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const totalDays = diffDays === 0 ? 1 : diffDays; // Kam se kam 1 din dikhaye

        // Ye hai wo Special Display (Start -> Days -> End)
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
        // Agar Active/Pending hai to Normal purana wala dikhao
        dateDisplayHtml = `<span class="text-[10px] text-slate-500"><i class="far fa-calendar-alt ml-1"></i> ${kit.createdDate}</span>`;
    }
    // --- 🔴 LOGIC END ---

    const typeBadge = kit.type === 'Final Unit' 
        ? '<span class="bg-green-900/50 text-green-400 px-2 rounded text-[10px] border border-green-500/30">FINAL</span>' 
        : '<span class="bg-yellow-900/50 text-yellow-400 px-2 rounded text-[10px] border border-yellow-500/30">PART</span>';
    
    // Close Button Logic
    const isComplete = totalDone >= kit.totalQty;
    let closeBtn = '';
    
    if (kit.status === 'Closed') {
        closeBtn = `<button class="flex-1 bg-slate-800 text-slate-500 py-2 rounded text-xs cursor-default">Completed & Locked</button>`;
    } else {
        closeBtn = isComplete 
            ? `<button onclick="closeKitAction('${kit.id}')" class="flex-1 bg-emerald-600/20 text-emerald-400 py-2 rounded text-xs border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition font-bold"><i class="fas fa-check-circle mr-1"></i> Mark as Completed</button>` 
            : `<button class="flex-1 bg-slate-800 text-slate-600 py-2 rounded text-xs cursor-not-allowed" disabled>Incomplete</button>`;
    }

    const transferBtn = kit.status === 'Closed' 
        ? '' 
        : `<button onclick="initTransfer('${kit.id}')" class="flex-1 bg-orange-600/20 text-orange-400 py-2 rounded text-xs border border-orange-500/30 hover:bg-orange-600 hover:text-white transition">Transfer</button>`;

    let table = `
    <table class="w-full text-[10px] text-left text-slate-300 mt-4 table-fixed">
        <thead class="bg-slate-900 sticky top-0">
            <tr>
                <th class="p-2 w-20">DATE</th>
                <th class="p-2 text-center">INPUT</th>
                <th class="p-2 text-center text-green-400">FINAL PACK</th>
                <th class="p-2 text-center text-orange-400">SEMI FG</th>
                <th class="p-2 text-center text-purple-400">REWORK</th>
                <th class="p-2 text-center text-cyan-400">REMAINING</th>
                <th class="p-2 text-right text-red-400">REJECTION</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-white/5">`;

    logs.forEach(l => {
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
    });
    table += '</tbody></table>';

    // HTML Structure Update (New Date Display Add kiya hai yahan)
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
                    <!-- YAHAN AAYEGA SPECIAL DATE DISPLAY -->
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

    // Filter Logic: Status 'Closed' hona chahiye
    const closed = kits.filter(k => 
        k.status === 'Closed' && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "All Lines" || k.line === line)
    );

    list.innerHTML = '';
    
    if (closed.length === 0) {
        list.innerHTML = '<div class="text-slate-500 text-center text-xs p-4">No closed kits found.</div>';
        return;
    }

    closed.forEach(k => {
        const div = document.createElement('div');
        // Isme wahi CSS class lagayi hai jo Active mein thi taaki design same dikhe
        div.className = "kit-item flex justify-between items-center bg-slate-800/50 p-3 rounded mb-2 border border-white/5 hover:border-blue-500/50 cursor-pointer";
        div.innerHTML = `
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

async function handleTransferKit(e) {
    e.preventDefault();
    const id = document.getElementById('transferKitId').value;
    const k = kits.find(x => x.id === id);
    const qty = parseInt(document.getElementById('transferQty').value);
    if(qty > (k.totalQty - (k.packedQty+k.rejectionQty))) return alert("Invalid Qty");
    
    const newId = id + "-TR";
    const newKit = { ...k, id: newId, totalQty: qty, remainingQty: qty, packedQty: 0, rejectionQty: 0, usedQty:0, line: document.getElementById('transferTo').value, isTransferred: true, createdDate: getLocalDateString() };
    
    await updateDoc(doc(db,"kits",id), { totalQty: k.totalQty - qty });
    await setDoc(doc(db,"kits",newId), newKit);
    await addProductionLog({ date: getLocalDateString(), line: "System", leader: "Transfer", kitId: id, model: k.model, input:0, output:0, remarks: `Transfer to ${newId}` });
    
    location.reload();
}

window.exportManagerData = exportManagerData;
window.exportClosedKits = exportClosedKits;
window.initTransfer = function(id) { document.getElementById('transferKitId').value=id; document.getElementById('transferFrom').value=kits.find(k=>k.id===id).line; document.getElementById('transferModal').classList.remove('hidden'); }
window.closeKitAction = async function(id) { 
    if(confirm('Archive this Kit?')) { 
        // Ab hum status ke saath-saath AAJ KI DATE bhi save karenge
        await updateDoc(doc(db,"kits",id), {
            status:'Closed',
            closedDate: getLocalDateString() // <--- YE ZAROORI HAI
        }); 
        location.reload(); 
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
function exportClosedKits() {
    let csv = "Kit,Model,Line,Date,Pack\n" + kits.filter(k=>k.status==='Closed').map(k => `${k.id},${k.model},${k.line},${k.createdDate},${k.packedQty}`).join("\n");
    const link = document.createElement("a"); link.href = "data:text/csv;charset=utf-8," + encodeURI(csv); link.download = "Archive.csv"; link.click();
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

    // Filter Logic
    const filtered = kits.filter(k => 
        k.status === 'Active' && 
        isKitPending(k.createdDate) && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "All Lines" || k.line === line)
    );

    list.innerHTML = '';
    if(!filtered.length) list.innerHTML = '<div class="text-slate-500 text-center text-xs p-4">No pending records found.</div>';

    filtered.forEach(k => {
        const div = document.createElement('div');
        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        const lineShort = k.line.replace('Line ','L').trim();
        
        // CSS wahi hai (Orange Border wala)
        div.className = `kit-item group border-l-2 border-orange-500 ${k.isTransferred?'is-transferred':''}`;
        
        // ✨ CHANGE IS HERE: "Overdue" hata diya, "Model" wapas laga diya
        div.innerHTML = `
            <div class="flex items-center gap-3 mb-2">
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