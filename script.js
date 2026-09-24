// ================= STANDALONE ATC BEELTY SCRIPT =================
window.currentSlipHistory = [];

// ⚠️ APNA APPS SCRIPT EXEC URL YAHAN DALEIN
const scriptURL = 'https://script.google.com/macros/s/AKfycbw0qusUPFVNAb-lbHwfvs1eBiVh3Z4hthQMNk6QbR1Etw05A9jxcD7nqKGHLlLHp5Ys/exec';
const APP_PASSWORD = "1234";

function apiUrl(query) {
    const q = query || '';
    const sep = q.includes('?') ? '&' : '?';
    return scriptURL + q + sep + 'pass=' + encodeURIComponent(APP_PASSWORD);
}

// ================= DATE & UTILITIES =================
function getTodayDateFormatted() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function safeAttr(val) { 
    return String(val == null ? "" : val).replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;"); 
}

function formatDisplayDate(dateVal) {
    if (!dateVal) return "-";
    let str = String(dateVal).trim();
    if (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(str)) return str.replace(/-/g, '/');
    let d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    return str;
}

function formatWhatsAppPhone(phone) {
    let digits = String(phone || "").replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length === 10) return '91' + digits;
    if (digits.length === 11 && !digits.startsWith('91') && digits.startsWith('0')) return '91' + digits.slice(1);
    return digits;
}

// ================= CACHE MANAGEMENT =================
function getLocalSlipsCache() {
    try {
        const saved = localStorage.getItem('atc_standalone_slips');
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
}

function setLocalSlipsCache(data) {
    if (Array.isArray(data)) {
        window.currentSlipHistory = data;
        try { localStorage.setItem('atc_standalone_slips', JSON.stringify(data)); } catch(e) {}
    }
}

async function syncSlipsFromServer() {
    try {
        const response = await fetch(apiUrl("?action=listSlips"));
        if (!response.ok) return;
        const slips = await response.json();
        if (Array.isArray(slips)) {
            setLocalSlipsCache(slips);
            if (!document.getElementById('tab-archive').classList.contains('hidden')) {
                renderSlipHistoryList();
            }
        }
    } catch(e) { console.warn("Slips sync error:", e); }
}

// ================= TAB NAVIGATION =================
function showTab(tabName) {
    if (tabName === 'create') {
        document.getElementById('tab-create').classList.remove('hidden');
        document.getElementById('tab-archive').classList.add('hidden');
    } else {
        document.getElementById('tab-create').classList.add('hidden');
        document.getElementById('tab-archive').classList.remove('hidden');
        loadSlipHistory();
    }
}

// ================= ONLOAD =================
window.onload = () => {
    checkLoginStatus(); // 🟢 Lock status check


    const slipDateEl = document.getElementById('slip_date');
    if (slipDateEl) slipDateEl.value = getTodayDateFormatted();

    window.currentSlipHistory = getLocalSlipsCache();
    loadVehicleListForSlip();
    syncSlipsFromServer();
};

// Timing Suffix (Auto 'Hr' add karna)
const timingInput = document.getElementById('slip_timing');
if(timingInput) {
    timingInput.addEventListener('blur', function() {
        let val = this.value.trim();
        if(val !== "" && !val.toUpperCase().includes('HR')) {
            this.value = val + " Hr";
        }
    });
}

function calculateSlip() {
    let rate = parseFloat(document.getElementById('slip_rate').value) || 0;
    let weight = parseFloat(document.getElementById('slip_weight').value) || 0;
    let overloadWeight = parseFloat(document.getElementById('slip_overloadWeight').value) || 0;
    let overloadRate = parseFloat(document.getElementById('slip_overloadRate').value) || rate; // Agar blank ho toh main rate use hoga

    // Regular freight calculation
    let freight_total = Math.round(weight * rate);
    
    // Overload freight calculation
    let overload_total = Math.round(overloadWeight * overloadRate);
    
    // Combined freight
    let combined_freight = freight_total + overload_total;
    
    if((rate > 0 && weight > 0) || (overloadRate > 0 && overloadWeight > 0)) {
        document.getElementById('slip_freight').value = combined_freight;
    }
    
    updateFinalNetPayable();
}

function calculateTotalFromManual() { updateFinalNetPayable(); }

function updateFinalNetPayable() {
    let freight = parseFloat(document.getElementById('slip_freight').value) || 0;
    let adv = parseFloat(document.getElementById('slip_advance').value) || 0;
    let dPrice = parseFloat(document.getElementById('slip_dPrice').value) || 0;
    
    let toPay = (freight - adv) + dPrice;
    document.getElementById('slip_toPay').value = toPay > 0 ? Math.round(toPay) : (toPay === 0 ? "0" : Math.round(toPay));
}
// ================= VEHICLE SEARCH & AUTO-FILL =================
async function loadVehicleListForSlip() {
    const list = document.getElementById('vehicleListOptions');
    if (!list) return;
    try {
        const res = await fetch(apiUrl("?action=getVehicles"));
        const vehicles = await res.json();
        if (Array.isArray(vehicles)) {
            list.innerHTML = vehicles.map(v => `<option value="${v}">`).join('');
        }
    } catch(e) {}
}

async function searchVehicleForSlip() {
    const vNo = document.getElementById('slipSearchVNo').value.toUpperCase().trim();
    if(!vNo) return alert("Please enter a Vehicle Number!");
    
    clearSlipForNewEntry(vNo);
    await autoFillOwnerDriver(vNo);
}

function clearSlipForNewEntry(vNo) {
    document.getElementById('slip_vNo').value = vNo;
    document.getElementById('slip_date').value = getTodayDateFormatted();
    document.getElementById('slip_party').value = "";
    document.getElementById('slip_from').value = "";
    document.getElementById('slip_to').value = "";
    document.getElementById('slip_rate').value = 0;
    document.getElementById('slip_weight').value = 0;
    document.getElementById('slip_overloadWeight').value = 0;
    document.getElementById('slip_overloadRate').value = "";
    document.getElementById('slip_freight').value = 0;
    document.getElementById('slip_advance').value = 0;
    document.getElementById('slip_dPrice').value = 0;
    document.getElementById('slip_timing').value = "";
    document.getElementById('slip_lOwner').value = "";
    document.getElementById('slip_oVillage').value = "";
    document.getElementById('slip_oMob').value = "";
    document.getElementById('slip_dName').value = "";
    document.getElementById('slip_dVillage').value = "";
    document.getElementById('slip_dMob').value = "";
    document.getElementById('slip_licence').value = "";
    document.getElementById('slip_rowNum').value = "";
    document.getElementById('slip_archiveRow').value = "";
    calculateSlip();
}

function resetBeeltyForm() {
    document.getElementById('slipSearchVNo').value = "";
    clearSlipForNewEntry("");
}

async function autoFillOwnerDriver(vNo) {
    vNo = (vNo || "").toUpperCase().trim();
    if (!vNo) return;
    try {
        const res = await fetch(apiUrl(`?action=getVehicleProfile&vNo=${encodeURIComponent(vNo)}`));
        const profile = await res.json();
        if (!profile || Object.keys(profile).length === 0) return;

        if (profile.lOwner) document.getElementById('slip_lOwner').value = profile.lOwner;
        if (profile.oVillage) document.getElementById('slip_oVillage').value = profile.oVillage;
        if (profile.oMob) document.getElementById('slip_oMob').value = profile.oMob;
        if (profile.dName) document.getElementById('slip_dName').value = profile.dName;
        if (profile.dVillage) document.getElementById('slip_dVillage').value = profile.dVillage;
        if (profile.dMob) document.getElementById('slip_dMob').value = profile.dMob;
        if (profile.licence) document.getElementById('slip_licence').value = profile.licence;
    } catch (e) {}
}

// ================= PDF GENERATION & GOOGLE DRIVE SAVE =================
// --- PERFECT ZERO-CUT BEELTY PDF GENERATOR (WITH FULL ADDRESS BAR) ---
async function generateBeeltyPDF() {
    const btn = document.getElementById('slipSubmitBtn');
    const originalElement = document.getElementById('receipt-to-print');
    const vNo = (document.getElementById('slip_vNo').value || "N/A").toUpperCase().trim();

    if (!vNo || vNo === "N/A") return alert("Please enter Vehicle Number!");

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating PDF & Saving...';

    // 1. Inputs DOM attribute sync
    const allInputs = originalElement.querySelectorAll('input');
    allInputs.forEach(input => {
        if (input.type !== 'number' && input.type !== 'date') input.value = (input.value || "").toUpperCase();
        input.setAttribute('value', input.value);
    });

    // 2. Clean Clone
    const clone = originalElement.cloneNode(true);
    clone.querySelectorAll('button').forEach(el => el.remove());

    // 3. Render Wrapper at (0,0) with Full Bottom Address Buffer (22px Padding)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: absolute; left: 0; top: 0; width: 794px; background: #ffffff; z-index: 999999; margin: 0; padding: 0; zoom: 1 !important;';
    
    // 🔥 PADDING-BOTTOM 24px (Taaki Address Patti aur Bottom Border bilkul na kate)
    clone.style.cssText = 'width: 794px !important; zoom: 1 !important; height: auto !important; min-height: 0 !important; background: #ffffff !important; margin: 0 auto !important; transform: none !important; box-shadow: none !important; border: 3px double #c2185b !important; padding: 20px 24px 24px 24px !important; display: flex !important; flex-direction: column !important; justify-content: flex-start !important; box-sizing: border-box !important;';
    
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    window.scrollTo(0, 0);

    const opt = {
        margin: [0, 0, 0, 0],
        filename: `Slip_${vNo}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            scrollX: 0, 
            scrollY: 0, 
            x: 0, 
            y: 0, 
            width: 794, 
            windowWidth: 794, 
            logging: false 
        }
    };

    try {
        const worker = html2pdf().set(opt).from(clone).toCanvas();
        const canvas = await worker.get('canvas');
        const pdfWidthMM = 210;
        
        // 🔥 Safe height buffer (+8px) taaki bottom border line bhi PDF me aaye
        const pdfHeightMM = ((canvas.height + 8) * pdfWidthMM) / canvas.width;

        const pdf = await worker
            .set({ jsPDF: { unit: 'mm', format: [pdfWidthMM, pdfHeightMM], orientation: 'portrait' } })
            .toPdf()
            .get('pdf');

        const pdfBlob = pdf.output('blob');
        const pdfBase64 = pdf.output('datauristring').split(',')[1];

        // 1. Download to Device
        pdf.save(opt.filename);

        const slipDateVal = document.getElementById('slip_date').value || getTodayDateFormatted();
        const editArchiveRow = document.getElementById('slip_archiveRow').value;
        const isEditSlip = !!editArchiveRow;

        const payload = {
            action: "saveLoadingSlip",
            rowNumber: document.getElementById('slip_rowNum').value || "",
            archiveRow: editArchiveRow || "",
            vNo: vNo,
            date: slipDateVal,
            pdfBase64: pdfBase64,
            partyName: document.getElementById('slip_party').value.toUpperCase(),
            from: document.getElementById('slip_from').value.toUpperCase(),
            to: document.getElementById('slip_to').value.toUpperCase(),
            rate: document.getElementById('slip_rate').value,
            weight: document.getElementById('slip_weight').value,
            overloadWeight: document.getElementById('slip_overloadWeight').value,
            overloadRate: document.getElementById('slip_overloadRate').value,
            advance: document.getElementById('slip_advance').value,
            driverPrice: document.getElementById('slip_dPrice').value,
            toPay: document.getElementById('slip_toPay').value,
            timing: document.getElementById('slip_timing').value,
            lorryOwner: document.getElementById('slip_lOwner').value.toUpperCase(),
            ownerVillage: document.getElementById('slip_oVillage').value.toUpperCase(),
            ownerMob: document.getElementById('slip_oMob').value.toUpperCase(),
            driverName: document.getElementById('slip_dName').value.toUpperCase(),
            driverVillage: document.getElementById('slip_dVillage').value.toUpperCase(),
            driverMob: document.getElementById('slip_dMob').value.toUpperCase(),
            licenceNo: document.getElementById('slip_licence').value.toUpperCase(),
            pass: APP_PASSWORD
        };

        // 2. Google Drive & Sheet Save
        const response = await fetch(scriptURL, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload) 
        });
        const resData = await response.json();

        if (resData && resData.success) {
            const targetRow = isEditSlip ? parseInt(editArchiveRow) : (window.currentSlipHistory.length > 0 ? Math.max(...window.currentSlipHistory.map(s=>s.rowNumber||0))+1 : 2);
            const newSlipEntry = {
                rowNumber: targetRow,
                name: `Slip_${vNo}_${slipDateVal.replace(/\//g, '-')}.pdf`,
                id: resData.fileId || "",
                date: slipDateVal,
                url: resData.fileUrl || "#",
                formData: JSON.stringify(payload)
            };

            if (isEditSlip) {
                const idx = window.currentSlipHistory.findIndex(s => s.rowNumber === parseInt(editArchiveRow));
                if (idx !== -1) window.currentSlipHistory[idx] = newSlipEntry;
            } else {
                window.currentSlipHistory.unshift(newSlipEntry);
            }
            setLocalSlipsCache(window.currentSlipHistory);

            alert("✅ Loading Slip Saved to Google Sheet & Drive Successfully!");
            resetBeeltyForm();
            showTab('archive');
        } else {
            alert("❌ Server Error: " + (resData.error || "Could not save to Drive"));
        }

    } catch (e) {
        console.error("PDF generation error:", e);
        alert("PDF Error: " + e.message);
    } finally {
        if (wrapper && wrapper.parentNode) document.body.removeChild(wrapper);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-cloud-arrow-up-fill me-2"></i> FINALIZE, SAVE & WHATSAPP';
    }
}

// ================= SLIP ARCHIVE HISTORY =================
function loadSlipHistory() {
    const container = document.getElementById('slipHistoryList');
    if (!container) return;
    
    window.currentSlipHistory = getLocalSlipsCache();
    if (window.currentSlipHistory && window.currentSlipHistory.length > 0) {
        renderSlipHistoryList();
    } else {
        container.innerHTML = '<div class="text-center w-100 p-4"><div class="spinner-border text-danger spinner-border-sm"></div> Fetching Slips...</div>';
    }
    syncSlipsFromServer();
}

function renderSlipHistoryList() {
    const container = document.getElementById('slipHistoryList');
    if (!container) return;

    container.innerHTML = "";

    if (!window.currentSlipHistory || window.currentSlipHistory.length === 0) {
        container.innerHTML = '<div class="text-center w-100 p-5 text-muted"><i class="bi bi-folder-x fs-1 d-block mb-2 opacity-50"></i>No Loading Slips found.</div>';
        return;
    }

    window.currentSlipHistory.forEach(slip => {
        let d = {};
        try { if (slip.formData) d = JSON.parse(slip.formData); } catch(e) {}

        const vNo = d.vNo || slip.name.replace(/^Slip_/, '').split('_')[0] || "TRUCK";
        const route = (d.from && d.to) ? `${d.from} ➔ ${d.to}` : "";
        const party = d.partyName ? ` | ${d.partyName}` : "";

        container.insertAdjacentHTML('beforeend', `
            <div class="col-12 col-md-6 mb-2">
                <div class="card shadow-sm border-0" style="border-radius:12px; border-left: 5px solid #c2185b; background: #ffffff;">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="text-truncate" style="max-width: 68%;">
                                <h6 class="fw-bold mb-1" style="font-size:14px; color:#900c3f;">
                                    <i class="bi bi-truck me-1"></i>${safeAttr(vNo)}
                                </h6>
                                ${route ? `<small class="text-dark fw-bold d-block" style="font-size:11px;">${safeAttr(route)}</small>` : ''}
                                <small class="text-muted" style="font-size:10px;">
                                    <i class="bi bi-calendar3"></i> ${slip.date || ''} ${safeAttr(party)}
                                </small>
                            </div>
                            <div class="d-flex gap-2">
                                ${slip.url && slip.url !== '#' ? `<a href="${slip.url}" target="_blank" class="btn btn-sm btn-light text-danger border" title="View PDF"><i class="bi bi-file-pdf"></i></a>` : ''}
                                <button class="btn btn-sm btn-outline-danger" onclick="editSavedSlip(${slip.rowNumber})" title="Edit Slip"><i class="bi bi-pencil-square"></i></button>
                                <button class="btn btn-sm btn-success" onclick="shareSlipWhatsApp(${slip.rowNumber})" title="WhatsApp Share"><i class="bi bi-whatsapp"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);
    });
}

function editSavedSlip(rowNumber) {
    const slip = window.currentSlipHistory.find(s => s.rowNumber === rowNumber);
    if (!slip || !slip.formData) return alert("Slip data not found for editing.");

    let d = {};
    try { d = JSON.parse(slip.formData); } catch (e) { return alert("Data reading error."); }

    showTab('create');

    document.getElementById('slip_vNo').value = d.vNo || "";
    document.getElementById('slip_date').value = d.date || getTodayDateFormatted();
    document.getElementById('slip_party').value = d.partyName || "";
    document.getElementById('slip_from').value = d.from || "";
    document.getElementById('slip_to').value = d.to || "";
    document.getElementById('slip_rate').value = d.rate || 0;
    document.getElementById('slip_weight').value = d.weight || 0;
    document.getElementById('slip_overloadWeight').value = d.overloadWeight || 0;
    document.getElementById('slip_overloadRate').value = d.overloadRate || "";
    document.getElementById('slip_advance').value = d.advance || 0;
    document.getElementById('slip_dPrice').value = d.driverPrice || 0;
    document.getElementById('slip_timing').value = d.timing || "";
    document.getElementById('slip_lOwner').value = d.lorryOwner || "";
    document.getElementById('slip_oVillage').value = d.ownerVillage || "";
    document.getElementById('slip_oMob').value = d.ownerMob || "";
    document.getElementById('slip_dName').value = d.driverName || "";
    document.getElementById('slip_dVillage').value = d.driverVillage || "";
    document.getElementById('slip_dMob').value = d.driverMob || "";
    document.getElementById('slip_licence').value = d.licenceNo || "";
    document.getElementById('slip_rowNum').value = d.rowNumber || "";
    document.getElementById('slip_archiveRow').value = rowNumber;

    calculateSlip();
    document.getElementById('receipt-to-print').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shareSlipWhatsApp(rowNumber) {
    const slip = window.currentSlipHistory.find(s => s.rowNumber === rowNumber);
    if (!slip) return alert("Slip data missing.");

    let d = {};
    try { if (slip.formData) d = JSON.parse(slip.formData); } catch(e) {}

    const vNo = d.vNo || slip.name.replace(/^Slip_/, '').split('_')[0] || "Vehicle";
    const tDate = d.date || slip.date || getTodayDateFormatted();
    const from = d.from || "N/A";
    const to = d.to || "N/A";
    const party = d.partyName || "N/A";
    const toPay = d.toPay || "0";
    const pdfUrl = (slip.url && slip.url !== '#' && slip.url !== '') ? slip.url : "";

    let targetPhone = d.ownerMob || d.driverMob || "";
    let cleanPhone = formatWhatsAppPhone(targetPhone);

    const messageText = `🏢 *ALLINDIA TRANSPORT COMPANY*
_Vegetable Suppliers - Loading Slip_
==========================
🚚 Vehicle: *${vNo}*
📅 Date: ${tDate}
🛣️ Route: ${from} ➔ ${to}
🏢 Party: ${party}

💰 *NET PAYABLE (TO PAY): ₹${toPay}*
${pdfUrl ? `\n📄 *BEELTY PDF LINK:*\n${pdfUrl}\n` : ''}==========================
_Munna Bhai & Asif Bhai_
📲 9673732113 | 7030732113`;

    const encodedMsg = encodeURIComponent(messageText);
    const whatsappURL = (cleanPhone && cleanPhone.length >= 12) 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
        : `https://api.whatsapp.com/send?text=${encodedMsg}`;

    try { window.location.href = whatsappURL; } catch (e) { window.open(whatsappURL, '_blank'); }
}

// Vehicle Auto-formatting
document.addEventListener('input', function(e) {
    if (['slipSearchVNo', 'slip_vNo'].includes(e.target.id)) {
        let cleanStr = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        let res = "";
        if (cleanStr.length > 0) res += cleanStr.substring(0, 2); 
        if (cleanStr.length > 2) res += " " + cleanStr.substring(2, 4); 
        if (cleanStr.length > 4) {
            let remaining = cleanStr.substring(4);
            let letters = remaining.match(/^[A-Z]+/);
            if (letters) {
                res += " " + letters[0];
                let numbers = remaining.substring(letters[0].length);
                if (numbers) res += " " + numbers.substring(0, 4);
            } else {
                res += " " + remaining.substring(0, 4);
            }
        }
        e.target.value = res;
    }
});

// ================= 📱 DYNAMIC MOBILE AUTO-SCALE CONTROLLER =================
function updateMobileScale() {
    const paper = document.querySelector('.atc-beelty-paper');
    const captureArea = document.getElementById('beelty-capture-area');
    if (!paper || !captureArea) return;

    if (window.innerWidth > 820 || paper.classList.contains('zoom-100-mode')) {
        paper.style.transform = 'none';
        paper.style.marginBottom = '0';
        return;
    }

    const containerWidth = captureArea.clientWidth || (window.innerWidth - 16);
    const scale = Math.min((containerWidth - 4) / 794, 1);

    paper.style.transform = `scale(${scale})`;
    paper.style.transformOrigin = 'top left';

    // 🔥 Safe bottom buffer (Taaki Driver Sign aur Address patti bilkul na kate)
    const paperHeight = paper.scrollHeight || 1020;
    const scaledHeight = paperHeight * scale;
    const marginOffset = scaledHeight - paperHeight;
    paper.style.marginBottom = `${marginOffset + 40}px`;
}

function setBeeltyZoom(mode) {
    const paper = document.querySelector('.atc-beelty-paper');
    const btnFit = document.getElementById('btnZoomFit');
    const btn100 = document.getElementById('btnZoom100');
    if (!paper) return;

    if (mode === 'fit') {
        paper.classList.remove('zoom-100-mode');
        if (btnFit) { btnFit.classList.add('btn-warning', 'active'); btnFit.classList.remove('btn-outline-light'); }
        if (btn100) { btn100.classList.remove('btn-warning', 'active'); btn100.classList.add('btn-outline-light'); }
        updateMobileScale();
    } else {
        paper.classList.add('zoom-100-mode');
        paper.style.transform = 'none';
        paper.style.marginBottom = '0';
        if (btnFit) { btnFit.classList.remove('btn-warning', 'active'); btnFit.classList.add('btn-outline-light'); }
        if (btn100) { btn100.classList.add('btn-warning', 'active'); btn100.classList.remove('btn-outline-light'); }
    }
}

// Window Load aur Resize par Auto-Fit
window.addEventListener('resize', updateMobileScale);
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateMobileScale, 200);
});

// ================= 🔒 LOGIN & SECURITY CONTROLLER =================
function checkLoginStatus() {
    const isUnlocked = localStorage.getItem('atc_unlocked');
    const lockScreen = document.getElementById('lock-screen');
    if (isUnlocked === 'true' && lockScreen) {
        lockScreen.classList.add('lock-hidden');
    }
}

function handleLogin() {
    const passInp = document.getElementById('loginPass');
    const errorMsg = document.getElementById('lock-error');
    const lockScreen = document.getElementById('lock-screen');
    const btn = document.getElementById('loginBtn');

    if (!passInp) return;
    const entered = passInp.value.trim();

    if (entered === APP_PASSWORD || entered === "1234") {
        localStorage.setItem('atc_unlocked', 'true');
        if (errorMsg) errorMsg.classList.add('hidden');
        if (lockScreen) lockScreen.classList.add('lock-hidden');
    } else {
        if (errorMsg) errorMsg.classList.remove('hidden');
        passInp.value = "";
        passInp.focus();
    }
}
window.handleLogin = handleLogin;

function togglePassVisibility() {
    const passInp = document.getElementById('loginPass');
    const icon = document.getElementById('passEyeIcon');
    if (!passInp || !icon) return;
    if (passInp.type === 'password') {
        passInp.type = 'text';
        icon.classList.replace('bi-eye', 'bi-eye-slash');
    } else {
        passInp.type = 'password';
        icon.classList.replace('bi-eye-slash', 'bi-eye');
    }
}
window.togglePassVisibility = togglePassVisibility;

function logout() {
    if (confirm("Kya aap sach mein Logout / Screen Lock karna chahte hain?")) {
        localStorage.removeItem('atc_unlocked');
        const lockScreen = document.getElementById('lock-screen');
        if (lockScreen) lockScreen.classList.remove('lock-hidden');
        const passInp = document.getElementById('loginPass');
        if (passInp) {
            passInp.value = "";
            passInp.focus();
        }
    }
}
window.logout = logout;