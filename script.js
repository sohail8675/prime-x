/* PRIME X v4.6 - STABLE FIXED (Buttons Restored) */
import { loginUser, logoutUser } from './auth.js';
import { db } from './firebase.js';
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// STATE
let kits = [];
let productionLogs = [];
let currentUserRole = '';
let currentView = 'loginSection';
let tempSelectedLinks = []; // New variable for linking
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

// --- INIT (COMPLETE & FIXED) ---
document.addEventListener('DOMContentLoaded', () => {
  // Time Update
  setInterval(() => {
    const d = new Date();
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const display = document.getElementById('liveTimeDisplay');
    if(display) display.innerText = timeStr;
  }, 1000);  

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
    
    // --- LINKING SYSTEM LISTENERS (NEW) ---
    const linkTrigger = document.getElementById('linkedKitsTrigger');
    if(linkTrigger) {
        linkTrigger.addEventListener('click', openLinkModal);
    }
    const closeLink = document.getElementById('closeLinkModal');
    if(closeLink) closeLink.addEventListener('click', () => document.getElementById('linkSelectionModal').classList.add('hidden'));

    // Live Filters for Link Modal
    ['linkFilterDate', 'linkFilterLine', 'linkFilterType', 'linkSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener(id.includes('Search')?'keyup':'change', renderLinkableKits);
        }
    });

    const confirmLink = document.getElementById('confirmLinksBtn');
    if(confirmLink) confirmLink.addEventListener('click', saveLinkedKits);

    const clearLink = document.getElementById('clearLinksBtn');
    if(clearLink) clearLink.addEventListener('click', () => {
        tempSelectedLinks = [];
        renderLinkableKits();
        updateLinkCount();
    });

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
        kits = []; 
        kSnap.forEach(d => kits.push(d.data())); // Kits ka ID data ke andar hi hai
        
        const lSnap = await getDocs(collection(db, "productionLogs"));
        productionLogs = []; 
        // 🔴 CHANGE: Ab hum Log ka asli FireStore ID bhi save kar rahe hain taaki edit kar sakein
        lSnap.forEach(d => productionLogs.push({ id: d.id, ...d.data() })); 
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
    const type = document.getElementById('sidebarTypeFilter').value;

       // ISKO PASTE KARO (Purane 'const filtered' ki jagah)
    const filtered = kits.filter(k => 
        k.status === 'Active' && 
        !isKitPending(k.createdDate) &&
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || line === "All Lines" || k.line === line) && // <--- YE FIX HAI
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
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

// --- 🗑️ NEW DELETE FUNCTION (Copy at bottom of script.js) ---
window.deleteLogEntry = async function(logId, kitId) {
    // 1. Permission Check
    if(currentUserRole !== 'Data Incharge') return alert("Access Denied: Only Data Incharge can delete logs.");
    
    // 2. Confirmation
    if(!confirm("⚠️ DANGER ZONE!\nAre you sure you want to PERMANENTLY DELETE this entry?\n\nThis will reverse the Input, Output, and Rejection counts from the Kit.")) return;

    try {
        // 3. Log dhoondo (Data nikalne ke liye)
        const log = productionLogs.find(l => l.id === logId);
        if(!log) throw new Error("Log data not found locally. Please refresh.");

        // 4. Kit dhoondo (Update karne ke liye)
        const kit = kits.find(k => k.id === kitId);
        if(!kit) throw new Error("Parent Kit not found.");

        // 5. Calculations REVERSE karo (Jo add hua tha, usko minus karo)
        // Ensure hum NaN (Not a Number) issues se bachein
        const inputToRemove = parseInt(log.input) || 0;
        const outputToRemove = parseInt(log.output) || 0;
        const rejectionToRemove = parseInt(log.rejection) || 0;
        const semiToRemove = parseInt(log.semi) || 0;
        const reworkToRemove = parseInt(log.rework) || 0;

        const newUsedQty = Math.max(0, (kit.usedQty || 0) - inputToRemove);
        const newPackedQty = Math.max(0, (kit.packedQty || 0) - outputToRemove);
        const newRejectionQty = Math.max(0, (kit.rejectionQty || 0) - rejectionToRemove);
        const newSemiQty = Math.max(0, (kit.semiQty || 0) - semiToRemove);
        const newReworkQty = Math.max(0, (kit.reworkQty || 0) - reworkToRemove);

        // 6. FIREBASE UPDATE (Parallel execution for speed)
        await Promise.all([
            deleteDoc(doc(db, "productionLogs", logId)), // Log Delete
            updateDoc(doc(db, "kits", kitId), {         // Kit Update
                usedQty: newUsedQty,
                packedQty: newPackedQty,
                rejectionQty: newRejectionQty,
                semiQty: newSemiQty,
                reworkQty: newReworkQty
            })
        ]);

        // 7. LOCAL DATA UPDATE (Taaki page reload na karna pade)
        // Local Log Array se hatao
        const logIndex = productionLogs.findIndex(l => l.id === logId);
        if (logIndex > -1) productionLogs.splice(logIndex, 1);

        // Local Kit Object update karo
        kit.usedQty = newUsedQty;
        kit.packedQty = newPackedQty;
        kit.rejectionQty = newRejectionQty;
        kit.semiQty = newSemiQty;
        kit.reworkQty = newReworkQty;

        // 8. UI REFRESH
        alert("🗑️ Entry Deleted & Counts Reverted!");
        // Detail card wapas render karo taaki naye numbers dikhein
        const container = document.getElementById('dynamicDetailsContainer');
        if(container && container.firstElementChild) {
             renderManagerDetailCard(kit, container.firstElementChild);
        }

    } catch(err) {
        console.error(err);
        alert("Error Deleting Log: " + err.message);
    }
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

// --- FIXED DASHBOARD FILTER LOGIC ---
function updateManagerDashboard() {
    // 1. Inputs Uthao
    const start = document.getElementById('filterStartDate').value;
    const end = document.getElementById('filterEndDate').value;
    const lineVal = document.getElementById('filterLine').value; 
    
    // Check karo "All" hai ya Specific Line
    // (HTML mein <option value="All"> hai, kabhi kabhi browser 'All Lines' bhej deta hai, isliye safe check)
    const line = (lineVal === "All" || lineVal === "All Lines" || lineVal === "") ? null : lineVal;

    // 2. Logs Filter karo (Table aur Output stats ke liye)
    // Ye Date aur Line DONO check karega
    const filteredLogs = productionLogs.filter(l => {
        const dateMatch = (!start || l.date >= start) && (!end || l.date <= end);
        const lineMatch = (!line || l.line === line);
        return dateMatch && lineMatch;
    });

    // 3. Kits Filter karo (Remaining aur Rework stats ke liye)
    // Note: Active Kits par Date filter lagana sahi nahi hota, kyunki kit 3 din purani ho sakti hai par aaj bhi active hai.
    // Isliye hum yahan sirf LINE check karenge aur Status check karenge.
    const filteredKits = kits.filter(k => {
        const statusMatch = k.status === 'Active';
        const lineMatch = (!line || k.line === line);
        return statusMatch && lineMatch;
    });

    // 4. Calculation Variables
    let inp = 0, out = 0, rej = 0, semi = 0, rw = 0, rem = 0;

    // A. Logs se Jodo (Input, Packed, Reject, Semi)
    filteredLogs.forEach(l => {
        inp += (parseInt(l.input) || 0);
        out += (parseInt(l.output) || 0);
        rej += (parseInt(l.rejection) || 0);
        semi += (parseInt(l.semi) || 0);
        // Rework log se nahi, kit se uthayenge kyunki wo pending status hai
    });

    // B. Kits se Jodo (Rework Pending, Balance Remaining)
    filteredKits.forEach(k => {
        rw += (parseInt(k.reworkQty) || 0);
        // Remaining Logic: Total - (Packed + Reject)
        const currentRem = k.totalQty - (k.packedQty + k.rejectionQty);
        rem += Math.max(0, currentRem); // Negative na ho jaye
    });

    // 5. Cards Update Karo
    document.getElementById('statInput').innerText = inp;
    document.getElementById('statPacked').innerText = out;
    document.getElementById('statRejection').innerText = rej;
    document.getElementById('statSemi').innerText = semi;
    document.getElementById('statReworkPending').innerText = rw;
    document.getElementById('statKitRemaining').innerText = rem;

    // 6. Table Update Karo
    const tbody = document.getElementById('reportTableBody'); 
    tbody.innerHTML = '';
    
    if(filteredLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-slate-500 text-xs">No records found for this filter.</td></tr>';
        return;
    }

    // Logs ko reverse karo (Latest pehle)
    filteredLogs.slice().reverse().forEach(l => {
        // Kit dhoondho taaki Table mein bhi Remaining dikha sakein
        const k = kits.find(kt => kt.id === l.kitId);
        const rowRem = k ? (k.totalQty - (k.packedQty + k.rejectionQty)) : '-';
        
        tbody.innerHTML += `
            <tr class="hover:bg-white/5 transition border-b border-white/5">
                <td class="px-4 py-2 font-mono text-[10px] text-slate-300">${l.date}</td>
                <td class="px-4 text-[10px]">${l.line}</td>
                <td class="px-4 font-bold text-white text-xs">${l.kitId}</td>
                <td class="px-4 text-[10px] text-slate-400 font-mono">${l.model}</td>
                <td class="px-4 text-right font-mono text-xs">${l.input || 0}</td>
                <td class="px-4 text-right font-mono text-xs text-green-400 font-bold">${l.output || 0}</td>
                <td class="px-4 text-right font-mono text-xs text-orange-400">${l.semi || 0}</td>
                <td class="px-4 text-right font-mono text-xs text-purple-400">${l.rework || 0}</td>
                <td class="px-4 text-right font-mono text-xs text-cyan-400">${rowRem}</td>
                <td class="px-4 text-right font-mono text-xs text-red-400 font-bold">${l.rejection || 0}</td> 
            </tr>`;
    });
}
function renderClosedKits() {
    const list = document.getElementById('closedKitList');
    const term = document.getElementById('closedKitSearch').value.toLowerCase();
    const start = document.getElementById('closedDateStart').value;
    const end = document.getElementById('closedDateEnd').value;
    const line = document.getElementById('closedLineFilter').value;
    const type = document.getElementById('closedTypeFilter').value;

      // ISKO PASTE KARO (Purane 'const closed' ki jagah)
    const closed = kits.filter(k => 
        k.status === 'Closed' && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || line === "All Lines" || k.line === line) && // <--- YE FIX HAI
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
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
async function exportClosedKits() {
    // 1. Inputs Uthao
    const term = document.getElementById('closedKitSearch').value.toLowerCase();
    const start = document.getElementById('closedDateStart').value;
    const end = document.getElementById('closedDateEnd').value;
    const line = document.getElementById('closedLineFilter').value;
    const type = document.getElementById('closedTypeFilter').value;

    // 2. Filter Logic
    const closed = kits.filter(k => 
        k.status === 'Closed' && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || k.line === line) &&
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
    );

    if (closed.length === 0) {
        alert("No records match your filter!");
        return;
    }

    const btn = document.getElementById('exportArchiveBtn');
    const oldText = btn.innerHTML;
    btn.innerText = "Downloading...";

    try {
        // HEADER MEIN "KIT TAG" ADD KIYA HAI
        let csv = "Kit ID,Model,Line,Start Date,Close Date,Duration (Days),Last Leader,Last PQC,Total Order Qty,Total Input,Final Packed,Rejection,Semi FG,Rework Pending,Status,KIT TAG\n";

        const rows = closed.map(k => {
            // --- TAG LOGIC START ---
            let specialTag = "";
            if (k.isTransferred) specialTag = "TRANSFERRED";
            else if (k.type === "Final Unit") specialTag = "FINAL UNIT";
            else specialTag = ""; // Parts ke liye blank
            // --- TAG LOGIC END ---

            let duration = "1";
            if (k.createdDate && k.closedDate) {
                const start = new Date(k.createdDate);
                const end = new Date(k.closedDate);
                const diffTime = Math.abs(end - start);
                duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if(duration === 0) duration = 1;
            }

            const myLogs = productionLogs.filter(l => l.kitId === k.id);
            let lastLeader = "N/A";
            let lastPQC = "N/A";
            
            if (myLogs.length > 0) {
                const lastLog = myLogs[myLogs.length - 1]; 
                lastLeader = lastLog.leader || "N/A";
                lastPQC = lastLog.pqc || "N/A";
            }

            return `${k.id},${k.model},${k.line},${k.createdDate},${k.closedDate || 'N/A'},${duration} Days,${lastLeader},${lastPQC},${k.totalQty},${k.usedQty || 0},${k.packedQty},${k.rejectionQty},${k.semiQty || 0},${k.reworkQty || 0},Closed,${specialTag}`;
        });

        csv += rows.join("\n");

        const link = document.createElement("a");
        link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
        link.download = `PrimeX_Closed_Report_${getLocalDateString()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (err) {
        console.error(err);
        alert("Error exporting data.");
    } finally {
        btn.innerHTML = oldText; 
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
    
    const term = document.getElementById('pendingKitSearch').value.toLowerCase();
    const start = document.getElementById('pendingDateStart').value;
    const end = document.getElementById('pendingDateEnd').value;
    const line = document.getElementById('pendingLineFilter').value;
    const type = document.getElementById('pendingTypeFilter').value;

    const filtered = kits.filter(k => 
        k.status === 'Active' && 
        isKitPending(k.createdDate) && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || k.line === line) && 
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
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
    // 1. Inputs Uthao
    const term = document.getElementById('pendingKitSearch').value.toLowerCase();
    const start = document.getElementById('pendingDateStart').value;
    const end = document.getElementById('pendingDateEnd').value;
    const line = document.getElementById('pendingLineFilter').value;
    const type = document.getElementById('pendingTypeFilter').value;

    // 2. Filter Logic
    const pending = kits.filter(k => 
        k.status === 'Active' && 
        isKitPending(k.createdDate) && 
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || k.line === line) && 
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
    );

    if (pending.length === 0) {
        alert("No pending records match your filter!");
        return;
    }

    // HEADER MEIN "KIT TAG" ADD KIYA HAI
    let csv = "Created Date,Line,Kit ID,Model,Last Leader,Last PQC,Total Qty,Input,Final Pack,Rejection,Semi FG,Rework,Remaining,KIT TAG\n";

    pending.forEach(k => {
        // --- TAG LOGIC START ---
        let specialTag = "";
        if (k.isTransferred) specialTag = "TRANSFERRED";
        else if (k.type === "Final Unit") specialTag = "FINAL UNIT";
        else specialTag = ""; // Parts ke liye blank
        // --- TAG LOGIC END ---

        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        const kitLogs = productionLogs.filter(l => l.kitId === k.id);
        
        let lastLeader = "N/A";
        let lastPQC = "N/A";
        
        if (kitLogs.length > 0) {
            const latestLog = kitLogs[kitLogs.length - 1]; 
            lastLeader = latestLog.leader || "N/A";
            lastPQC = latestLog.pqc || "N/A";
        }

        csv += `${k.createdDate},${k.line},${k.id},${k.model},${lastLeader},${lastPQC},${k.totalQty},${k.usedQty || 0},${k.packedQty},${k.rejectionQty},${k.semiQty || 0},${k.reworkQty || 0},${rem},${specialTag}\n`;
    });

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
// Trigger Confetti
confetti({
    particleCount: 150,
    spread: 70,
    origin: { y: 0.6 }
});
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
window.exportActiveKits = function() {
    // 1. Inputs Uthao
    const term = document.getElementById('kitSearch').value.toLowerCase();
    const start = document.getElementById('sidebarDateStart').value;
    const end = document.getElementById('sidebarDateEnd').value;
    const line = document.getElementById('sidebarLineFilter').value;
    const type = document.getElementById('sidebarTypeFilter').value;

    // 2. Filter Logic (Active Units ke liye)
    const active = kits.filter(k => 
        k.status === 'Active' && 
        !isKitPending(k.createdDate) &&
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!start || k.createdDate >= start) && (!end || k.createdDate <= end) &&
        (!line || line === "" || k.line === line) && 
        (!type || type === "" || (type === "Transferred" ? k.isTransferred : k.type === type))
    );

    if (active.length === 0) {
        alert("No active records match your filter!");
        return;
    }

    let csv = "Created Date,Line,Kit ID,Model,Total Qty,Input,Final Pack,Rejection,Semi FG,Rework,Remaining,KIT TAG\n";

    active.forEach(k => {
        // --- TAG LOGIC START ---
        let specialTag = "";
        if (k.isTransferred) specialTag = "TRANSFERRED";
        else if (k.type === "Final Unit") specialTag = "FINAL UNIT";
        else specialTag = ""; 
        // --- TAG LOGIC END ---

        const rem = k.totalQty - (k.packedQty + k.rejectionQty);
        
        csv += `${k.createdDate},${k.line},${k.id},${k.model},${k.totalQty},${k.usedQty || 0},${k.packedQty},${k.rejectionQty},${k.semiQty || 0},${k.reworkQty || 0},${rem},${specialTag}\n`;
    });

    const link = document.createElement("a");
    link.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
    link.download = `Active_Kits_Report_${getLocalDateString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // --- NEW LINKING SYSTEM LOGIC ---

function openLinkModal() {
    // Reset or Load existing
    const currentVal = document.getElementById('linkedKitsInput').value;
    tempSelectedLinks = currentVal ? currentVal.split(',') : [];
    
    document.getElementById('linkSelectionModal').classList.remove('hidden');
    renderLinkableKits();
    updateLinkCount();
}

function renderLinkableKits() {
    const list = document.getElementById('linkableKitsList');
    list.innerHTML = '';

    const term = document.getElementById('linkSearch').value.toLowerCase();
    const date = document.getElementById('linkFilterDate').value;
    const line = document.getElementById('linkFilterLine').value;
    const type = document.getElementById('linkFilterType').value;

    // Filter Active Kits (Includes Pending automatically as they are status='Active')
    const candidates = kits.filter(k => 
        k.status === 'Active' &&
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!date || k.createdDate === date) &&
        (!line || k.line === line) &&
        (!type || k.type === type)
    );

    if(candidates.length === 0) {
        list.innerHTML = '<div class="text-center text-slate-500 py-10">No kits found to link.</div>';
        return;
    }

    candidates.forEach(k => {
        const isSelected = tempSelectedLinks.includes(k.id);
        const div = document.createElement('div');
        // Styling similar to kit item but smaller
        div.className = `p-3 rounded-lg border ${isSelected ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-800 border-white/5'} hover:border-blue-500/50 cursor-pointer flex justify-between items-center transition-all`;
        
        div.onclick = () => toggleLinkSelection(k.id);

        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-5 h-5 rounded border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-500'} flex items-center justify-center">
                    ${isSelected ? '<i class="fas fa-check text-white text-xs"></i>' : ''}
                </div>
                <div>
                    <div class="text-sm font-bold text-slate-200">${k.id}</div>
                    <div class="text-[10px] text-slate-400">${k.model} | ${k.line}</div>
                </div>
            </div>
            <div class="text-[10px] text-slate-500">${k.createdDate}</div>
        `;
        list.appendChild(div);
    });
}

function toggleLinkSelection(id) {
    if(tempSelectedLinks.includes(id)) {
        tempSelectedLinks = tempSelectedLinks.filter(x => x !== id);
    } else {
        if(tempSelectedLinks.length >= 5) {
            alert("Maximum 5 kits can be linked!");
            return;
        }
        tempSelectedLinks.push(id);
    }
    renderLinkableKits();
    updateLinkCount();
}

function updateLinkCount() {
    const count = tempSelectedLinks.length;
    const el = document.getElementById('linkCountDisplay');
    el.innerText = `${count} / 5 Selected`;
    el.className = count === 5 ? "text-red-400 font-bold font-mono text-sm mr-4" : "text-cyan-400 font-bold font-mono text-sm mr-4";
}

function saveLinkedKits() {
    const input = document.getElementById('linkedKitsInput');
    const trigger = document.getElementById('linkedKitsTrigger');
    
    input.value = tempSelectedLinks.join(',');
    
    if(tempSelectedLinks.length > 0) {
        trigger.innerHTML = `<span class="text-blue-400 font-bold">${tempSelectedLinks.length} Kits Linked</span> <i class="fas fa-check-circle text-blue-500"></i>`;
        trigger.classList.add('border-blue-500');
    } else {
        trigger.innerHTML = `<span>Select Kits to Link...</span> <i class="fas fa-link"></i>`;
        trigger.classList.remove('border-blue-500');
    }
    
    document.getElementById('linkSelectionModal').classList.add('hidden');
}
}
// --- NEW LINKING SYSTEM LOGIC (START) ---

// 1. Popup Kholne wala function
function openLinkModal() {
    // Check karo pehle se kuch select hai kya
    const inputVal = document.getElementById('linkedKitsInput').value;
    // Global variable update karo
    tempSelectedLinks = inputVal ? inputVal.split(',') : [];
    
    // Modal dikhao
    const modal = document.getElementById('linkSelectionModal');
    if(modal) {
        modal.classList.remove('hidden');
        renderLinkableKits(); // List load karo
        updateLinkCount();    // Count update karo
    } else {
        console.error("Link Modal HTML not found!");
    }
}

// 2. List Dikhane wala function
function renderLinkableKits() {
    const list = document.getElementById('linkableKitsList');
    if(!list) return;
    
    list.innerHTML = '';

    const term = document.getElementById('linkSearch').value.toLowerCase();
    const date = document.getElementById('linkFilterDate').value;
    const line = document.getElementById('linkFilterLine').value;
    const type = document.getElementById('linkFilterType').value;

    // Filter Logic: Active Kits + Filters
    const candidates = kits.filter(k => 
        k.status === 'Active' &&
        (k.id.toLowerCase().includes(term) || k.model.toLowerCase().includes(term)) &&
        (!date || k.createdDate === date) &&
        (!line || k.line === line) &&
        (!type || k.type === type)
    );

    if(candidates.length === 0) {
        list.innerHTML = '<div class="text-center text-slate-500 py-10">No kits found to link.</div>';
        return;
    }

    candidates.forEach(k => {
        const isSelected = tempSelectedLinks.includes(k.id);
        const div = document.createElement('div');
        
        // Styling
        div.className = `p-3 rounded-lg border ${isSelected ? 'bg-blue-900/20 border-blue-500' : 'bg-slate-800 border-white/5'} hover:border-blue-500/50 cursor-pointer flex justify-between items-center transition-all`;
        
        // Click karne par select/deselect hoga
        div.onclick = () => toggleLinkSelection(k.id);

        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-5 h-5 rounded border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-500'} flex items-center justify-center">
                    ${isSelected ? '<i class="fas fa-check text-white text-xs"></i>' : ''}
                </div>
                <div>
                    <div class="text-sm font-bold text-slate-200">${k.id}</div>
                    <div class="text-[10px] text-slate-400">${k.model} | ${k.line}</div>
                </div>
            </div>
            <div class="text-[10px] text-slate-500">${k.createdDate}</div>
        `;
        list.appendChild(div);
    });
}

// 3. Selection Toggle Function
function toggleLinkSelection(id) {
    if(tempSelectedLinks.includes(id)) {
        // Agar pehle se hai to hata do
        tempSelectedLinks = tempSelectedLinks.filter(x => x !== id);
    } else {
        // Agar naya hai to add karo (Max 5 check)
        if(tempSelectedLinks.length >= 5) {
            alert("Maximum 5 kits can be linked!");
            return;
        }
        tempSelectedLinks.push(id);
    }
    renderLinkableKits(); // List refresh
    updateLinkCount();    // Text refresh
}

// 4. Update Count Text
function updateLinkCount() {
    const count = tempSelectedLinks.length;
    const el = document.getElementById('linkCountDisplay');
    if(el) {
        el.innerText = `${count} / 5 Selected`;
        el.className = count === 5 ? "text-red-400 font-bold font-mono text-sm mr-4" : "text-cyan-400 font-bold font-mono text-sm mr-4";
    }
}

// 5. Confirm Button Click
function saveLinkedKits() {
    const input = document.getElementById('linkedKitsInput');
    const trigger = document.getElementById('linkedKitsTrigger');
    
    // Input value set karo (Form isko use karega)
    input.value = tempSelectedLinks.join(',');
    
    // Trigger box ka design badlo taaki user ko dikhe ki select ho gaya
    if(tempSelectedLinks.length > 0) {
        trigger.innerHTML = `<span class="text-blue-400 font-bold">${tempSelectedLinks.length} Kits Linked</span> <i class="fas fa-check-circle text-blue-500"></i>`;
        trigger.classList.add('border-blue-500');
    } else {
        trigger.innerHTML = `<span>Select Kits to Link...</span> <i class="fas fa-link"></i>`;
        trigger.classList.remove('border-blue-500');
    }
    
    // Modal band karo
    document.getElementById('linkSelectionModal').classList.add('hidden');
}
// --- NEW LINKING SYSTEM LOGIC (END) ---
// --- NEW DATE EDITING FUNCTIONS (ONLY FOR DATA INCHARGE) ---

// 1. KIT KI CREATION DATE CHANGE KARNA
window.editKitDate = async function(kitId, oldDate) {
    // Sirf Data Incharge allow hai (Double check)
    if(currentUserRole !== 'Data Incharge') return alert("Access Denied");

    const newDate = prompt(`Change Start Date for ${kitId}:`, oldDate);
    
    // Agar cancel kiya ya same date hai to kuch mat karo
    if(newDate === null || newDate === oldDate || newDate === "") return;

    if(confirm(`Update Creation Date from ${oldDate} to ${newDate}?`)) {
        try {
            // Firebase Update
            await updateDoc(doc(db, "kits", kitId), { createdDate: newDate });
            
            // Local Update
            const k = kits.find(x => x.id === kitId);
            if(k) k.createdDate = newDate;
            
            // Refresh View
            openKitAction(k);
            alert("Date Updated Successfully!");
        } catch(e) {
            console.error(e);
            alert("Error updating date: " + e.message);
        }
    }
}

// 2. PRODUCTION LOG KI DATE CHANGE KARNA
window.editLogDate = async function(logId, oldDate, kitId) {
    if(currentUserRole !== 'Data Incharge') return alert("Access Denied");
    if(!logId) return alert("Error: Log ID not found. Please refresh page.");

    const newDate = prompt("Change Production Log Date:", oldDate);
    
    if(newDate === null || newDate === oldDate || newDate === "") return;

    if(confirm(`Update Log Date from ${oldDate} to ${newDate}?`)) {
        try {
            // Firebase Update
            await updateDoc(doc(db, "productionLogs", logId), { date: newDate });

            // Local Update
            const log = productionLogs.find(l => l.id === logId);
            if(log) log.date = newDate;

            // Refresh View
            const k = kits.find(x => x.id === kitId);
            if(k) openKitAction(k);
            
            alert("Log Date Updated!");
        } catch(e) {
            console.error(e);
            alert("Error updating log: " + e.message);
        }
    }
}
// --- 🔄 UPDATE THIS FUNCTION IN SCRIPT.JS ---
function renderManagerDetailCard(kit, card) {
    const logs = productionLogs.filter(l => l.kitId === kit.id).reverse();
    const totalDone = kit.packedQty + kit.rejectionQty;
    const progress = Math.min((totalDone/kit.totalQty)*100, 100);
    const currentRem = kit.totalQty - totalDone;
    
    // --- 🗓️ DATE EDIT BUTTON ---
    let kitDateEditBtn = '';
    if(currentUserRole === 'Data Incharge') {
        kitDateEditBtn = `<button onclick="editKitDate('${kit.id}', '${kit.createdDate}')" class="ml-2 text-xs text-blue-500 hover:text-white bg-blue-900/20 px-1 rounded border border-blue-500/30" title="Edit Date"><i class="fas fa-pencil-alt"></i></button>`;
    }

    // --- 🗑️ DELETE KIT BUTTON (NEW) ---
    // Ye button sirf Data Incharge ko dikhega
    let deleteKitBtn = '';
    if(currentUserRole === 'Data Incharge') {
        deleteKitBtn = `
            <button onclick="deleteKitFull('${kit.id}')" class="bg-red-900/20 text-red-500 border border-red-500/30 p-2 rounded hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2" title="PERMANENTLY DELETE KIT">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
    }

    let dateDisplayHtml = '';
    if (kit.status === 'Closed') {
        const start = new Date(kit.createdDate);
        const end = kit.closedDate ? new Date(kit.closedDate) : new Date(); 
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const totalDays = diffDays === 0 ? 1 : diffDays;

        dateDisplayHtml = `
            <div class="flex items-center gap-2 text-[10px] bg-slate-900/80 p-1.5 rounded-lg border border-white/10 mt-1">
                <span class="text-slate-500">${kit.createdDate}</span> ${kitDateEditBtn}
                <i class="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                <span class="text-yellow-400 font-bold bg-yellow-900/20 px-1 rounded border border-yellow-500/30">${totalDays} Days</span>
                <i class="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                <span class="text-slate-500">${kit.closedDate || 'Today'}</span>
            </div>
        `;
    } else {
        dateDisplayHtml = `<span class="text-[10px] text-slate-500 flex items-center"><i class="far fa-calendar-alt mr-1"></i> ${kit.createdDate} ${kitDateEditBtn}</span>`;
    }

    const typeBadge = kit.type === 'Final Unit' 
        ? '<span class="bg-green-900/50 text-green-400 px-2 rounded text-[10px] border border-green-500/30">FINAL</span>' 
        : '<span class="bg-yellow-900/50 text-yellow-400 px-2 rounded text-[10px] border border-yellow-500/30">PART</span>';
    
    let linkedHtml = '';
    if (kit.linkedKits && kit.linkedKits.length > 0) {
        const links = kit.linkedKits.split(',');
        linkedHtml = `
            <div class="mt-2">
                <button onclick="document.getElementById('linkedList-${kit.id}').classList.toggle('hidden')" class="text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded hover:bg-indigo-900/50 transition flex items-center gap-1 w-full justify-center">
                    <i class="fas fa-link"></i> ${links.length} Linked Kits Connected
                </button>
                <div id="linkedList-${kit.id}" class="hidden mt-1 p-2 bg-slate-900 rounded border border-white/5 space-y-1">
                    ${links.map(lid => `<div class="text-[10px] text-slate-300 font-mono border-b border-white/5 pb-1 last:border-0"><i class="fas fa-angle-right text-indigo-500 mr-1"></i> ${lid}</div>`).join('')}
                </div>
            </div>
        `;
    }

    const isComplete = totalDone >= kit.totalQty;
    let closeBtn = kit.status === 'Closed' 
        ? `<button class="flex-1 bg-slate-800 text-slate-500 py-2 rounded text-xs cursor-default">Completed & Locked</button>`
        : (isComplete 
            ? `<button onclick="closeKitAction('${kit.id}')" class="flex-1 bg-emerald-600/20 text-emerald-400 py-2 rounded text-xs border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition font-bold"><i class="fas fa-check-circle mr-1"></i> Mark as Completed</button>` 
            : `<button class="flex-1 bg-slate-800 text-slate-600 py-2 rounded text-xs cursor-not-allowed" disabled>Incomplete</button>`);

    const transferBtn = (kit.status === 'Closed' || currentUserRole === 'Manager') 
        ? '' 
        : `<button onclick="initTransfer('${kit.id}')" class="flex-1 bg-orange-600/20 text-orange-400 py-2 rounded text-xs border border-orange-500/30 hover:bg-orange-600 hover:text-white transition">Transfer</button>`;

    let table = `
    <table class="w-full text-[10px] text-left text-slate-300 mt-4 table-fixed">
        <thead class="bg-slate-900 sticky top-0">
            <tr>
                <th class="p-2 w-24">DATE</th>
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
        // --- LOG ROW ACTIONS ---
        let logActionBtns = '';
        if(currentUserRole === 'Data Incharge') {
            logActionBtns = `
                <div class="flex gap-2 mt-1">
                    <button onclick="editLogDate('${l.id}', '${l.date}', '${kit.id}')" class="text-slate-500 hover:text-blue-400" title="Edit Date"><i class="fas fa-pen"></i></button>
                    <button onclick="deleteLogEntry('${l.id}', '${kit.id}')" class="text-slate-500 hover:text-red-500" title="Delete Entry"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }

        if (l.leader === 'System' || (l.remarks && l.remarks.includes('Transferred'))) {
            table += `
            <tr class="bg-orange-900/20 border-l-2 border-orange-500">
                <td class="p-2 text-orange-400 font-mono align-top">${l.date} ${logActionBtns}</td>
                <td colspan="6" class="p-2 text-left text-orange-200 italic tracking-wide align-middle">
                    <i class="fas fa-exchange-alt mr-2"></i> ${l.remarks}
                </td>
            </tr>`;
        } else {
            table += `
            <tr class="hover:bg-white/5 transition">
                <td class="p-2 truncate font-mono">${l.date} ${logActionBtns}</td>
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
                ${linkedHtml}
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
        
        <!-- BUTTONS ROW -->
        <div class="flex gap-2 mb-4">
             <!-- DELETE BUTTON IS HERE -->
             ${deleteKitBtn} 
             
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
// --- ☢️ PERMANENT DELETE KIT FUNCTION ---
// Copy this at the very bottom of script.js
window.deleteKitFull = async function(kitId) {
    // 1. Permission Check
    if(currentUserRole !== 'Data Incharge') return alert("Access Denied: You do not have permission to delete kits.");

    // 2. High Level Confirmation
    const conf1 = confirm(`⚠️ EXTREME DANGER ZONE\n\nYou are about to DELETE Kit: ${kitId}\n\nThis will remove the Kit and ALL its production history permanently.\nThis action CANNOT be undone.\n\nAre you absolutely sure?`);
    if(!conf1) return;

    // 3. Double Check (Safety Net)
    const conf2 = prompt(`To confirm deletion, please type "DELETE" below:`);
    if(conf2 !== "DELETE") return alert("Deletion Cancelled. You must type DELETE (all caps).");

    try {
        // --- A. Database Cleaning ---
        
        // 1. Delete the Main Kit Document
        await deleteDoc(doc(db, "kits", kitId));

        // 2. Find and Delete all Associated Logs (Cleanup)
        // Pehle logs dhoondo
        const q = query(collection(db, "productionLogs"), where("kitId", "==", kitId));
        const querySnapshot = await getDocs(q);
        
        // Ek ek karke saare logs delete karo
        const deletePromises = [];
        querySnapshot.forEach((docSnap) => {
            deletePromises.push(deleteDoc(docSnap.ref));
        });
        await Promise.all(deletePromises);

        // --- B. Local Data Cleaning ---
        
        // Local array se kit hatao
        kits = kits.filter(k => k.id !== kitId);
        
        // Local logs array se logs hatao
        productionLogs = productionLogs.filter(l => l.kitId !== kitId);

        // --- C. Finish ---
        alert(`✅ Kit ${kitId} and all its data have been deleted.`);
        
        // Wapas list par bhejo
        switchView('activeUnitsView');

    } catch (e) {
        console.error(e);
        alert("Error Deleting Kit: " + e.message);
    }
}