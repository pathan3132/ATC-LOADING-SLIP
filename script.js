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

// Slip ke formData se bhari cheezein (PDF base64) aur password hata do
function cleanSlip(slip) {
    try {
        if (slip && typeof slip.formData === 'string' &&
            (slip.formData.indexOf('"pdfBase64"') !== -1 || slip.formData.indexOf('"pass"') !== -1)) {
            const d = JSON.parse(slip.formData);
            delete d.pdfBase64;
            delete d.pass;
            return Object.assign({}, slip, { formData: JSON.stringify(d) });
        }
    } catch (e) {}
    return slip;
}

function setLocalSlipsCache(data) {
    if (Array.isArray(data)) {
        data = data.map(cleanSlip);
        window.currentSlipHistory = data;
        try { localStorage.setItem('atc_standalone_slips', JSON.stringify(data)); }
        catch (e) { console.warn('Local cache full:', e); }
        rebuildSuggestions();
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
    rebuildSuggestions();
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
    let rate = numVal('slip_rate') || 0;
    let weight = parseFloat(document.getElementById('slip_weight').value) || 0;
    let overloadWeight = parseFloat(document.getElementById('slip_overloadWeight').value) || 0;
    let overloadRate = numVal('slip_overloadRate') || rate; // Agar blank ho toh main rate use hoga

    // Driver Price Freight Amount me judega
    let dPrice = numVal('slip_dPrice') || 0;

    // Regular freight calculation (weight x rate + driver price)
    let freight_total = Math.round(weight * rate) + Math.round(dPrice);
    
    // Overload freight calculation
    let overload_total = Math.round(overloadWeight * overloadRate);
    
    // Insurance bhi Total Freight me judega
    let insurance = numVal('slip_insurance') || 0;

    // Combined freight (freight + overload + insurance)
    let combined_freight = freight_total + overload_total + Math.round(insurance);

    // Show separate amounts on slip
    document.getElementById('slip_freightAmt').value = freight_total;
    document.getElementById('slip_overloadAmt').value = overload_total;
    
    if((rate > 0 && weight > 0) || (overloadRate > 0 && overloadWeight > 0)) {
        document.getElementById('slip_freight').value = combined_freight;
    }
    
    updateFinalNetPayable();
}

// Advance kisne diya: PARTY ya ATC
function setAdvanceBy(who) {
    who = (who === 'ATC') ? 'ATC' : 'PARTY';
    const hid = document.getElementById('slip_advBy');
    if (hid) hid.value = who;
    ['PARTY', 'ATC'].forEach(k => {
        const b = document.getElementById('advBy_' + k);
        if (b) b.classList.toggle('active', k === who);
    });
}

function calculateTotalFromManual() { updateFinalNetPayable(); }

function updateFinalNetPayable() {
    let freight = numVal('slip_freight') || 0;
    let adv = numVal('slip_advance') || 0;
    
    // Advance 0 ho to "Paid By" row halka dikhe
    const advRow = document.getElementById('row_advanceBy');
    if (advRow) advRow.classList.toggle('adv-off', adv <= 0);

    let toPay = freight - adv;   // Driver Price Freight Amount me aur Insurance Total Freight me pehle se shamil hai
    document.getElementById('slip_toPay').value = toPay > 0 ? Math.round(toPay) : (toPay === 0 ? "0" : Math.round(toPay));
    formatAllAmounts();
}
// ================= VEHICLE SEARCH & AUTO-FILL =================
async function loadVehicleListForSlip() {
    try {
        const res = await fetch(apiUrl("?action=getVehicles"));
        const vehicles = await res.json();
        if (Array.isArray(vehicles)) {
            window.serverVehicles = vehicles;
            renderVehicleList();
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
    window._autoKey = null; window._autoSnap = null; showAutoHint('');
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
    setAdvanceBy('PARTY');
    document.getElementById('slip_dPrice').value = 0;
    document.getElementById('slip_insurance').value = 0;
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
    const key = vKey(vNo);
    if (key.length < 6) return;
    if (key === window._autoKey) return;           // already filled
    const editing = !!document.getElementById('slip_archiveRow').value;

    let p = window.vehicleProfiles[key];           // 1) phone me saved (instant)
    if (!p) {                                      // 2) server ki Vehicle_Profile sheet
        try {
            const res = await fetch(apiUrl(`?action=getVehicleProfile&vNo=${encodeURIComponent(String(vNo).toUpperCase().trim())}`));
            const sp = await res.json();
            if (sp && Object.keys(sp).length > 0) {
                p = Object.assign({ vNo: String(vNo).toUpperCase().trim() }, sp);
                window.vehicleProfiles[key] = p;
                saveProfilesLS();
                renderVehicleList();
            }
        } catch (e) {}
    }
    if (vKey(document.getElementById('slip_vNo').value) !== key) return; // user ne gaadi badal di
    if (p) {
        applyVehicleProfile(p, editing);
        markAutoFilled(key);
        showAutoHint('✅ Pichli slip se Owner/Driver details bhar di gayi', true);
    } else {
        showAutoHint('🆕 Nayi gaadi – pehle ki slip nahi mili. Type karte waqt suggestions dikhenge.', false);
    }
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
    // html2canvas input me letter-spacing ke saath poora number nahi dikhata (jaise 2,57,000 -> 2)
    clone.querySelectorAll('input').forEach(i => { i.style.letterSpacing = 'normal'; });

    // Advance Paid By: PDF me sirf selected (Party/ATC) dikhe; advance 0 ho to row hi hata do
    clone.querySelectorAll('.adv-chip:not(.active)').forEach(el => el.remove());
    if ((numVal('slip_advance') || 0) <= 0) {
        const advByRow = clone.querySelector('#row_advanceBy');
        if (advByRow) advByRow.remove();
    }

    // 3. Render Wrapper at (0,0) with Full Bottom Address Buffer (22px Padding)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: absolute; left: 0; top: 0; width: 794px; background: #ffffff; z-index: 999999; margin: 0; padding: 0; zoom: 1 !important;';
    
    // 🔥 PADDING-BOTTOM 24px (Taaki Address Patti aur Bottom Border bilkul na kate)
    clone.style.cssText = 'width: 794px !important; zoom: 1 !important; height: auto !important; min-height: 0 !important; background: #ffffff !important; margin: 0 auto !important; transform: none !important; box-shadow: none !important; border: 3px double #c2185b !important; padding: 20px 24px 24px 24px !important; display: flex !important; flex-direction: column !important; justify-content: flex-start !important; box-sizing: border-box !important;';
    
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    window.scrollTo(0, 0);

    // PDF me clickable links ke liye positions pehle hi note kar lo
    const linkRects = [];
    const cRect = clone.getBoundingClientRect();
    clone.querySelectorAll('a.atc-link').forEach(a => {
        const r = a.getBoundingClientRect();
        linkRects.push({ url: a.href, x: r.left - cRect.left, y: r.top - cRect.top, w: r.width, h: r.height });
    });

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

        // Website / Udyam links PDF me bhi clickable
        const mmPerPx = pdfWidthMM / 794;
        linkRects.forEach(l => { try { pdf.link(l.x * mmPerPx, l.y * mmPerPx, l.w * mmPerPx, l.h * mmPerPx, { url: l.url }); } catch (e) {} });

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
            rate: rawVal('slip_rate'),
            weight: document.getElementById('slip_weight').value,
            overloadWeight: document.getElementById('slip_overloadWeight').value,
            overloadRate: rawVal('slip_overloadRate'),
            advance: rawVal('slip_advance'),
            advanceBy: document.getElementById('slip_advBy').value,
            driverPrice: rawVal('slip_dPrice'),
            insurance: rawVal('slip_insurance'),
            totalFreight: rawVal('slip_freight'),
            toPay: rawVal('slip_toPay'),
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
            const guessedRow = window.currentSlipHistory.length > 0 ? Math.max(...window.currentSlipHistory.map(s => s.rowNumber || 0)) + 1 : 2;
            const targetRow = isEditSlip ? parseInt(editArchiveRow) : (parseInt(resData.row) > 1 ? parseInt(resData.row) : guessedRow);
            const savedData = Object.assign({}, payload);
            delete savedData.pdfBase64;   // bhari PDF data local me nahi rakhna
            delete savedData.pass;
            const newSlipEntry = {
                rowNumber: targetRow,
                name: `Slip_${vNo}_${slipDateVal.replace(/\//g, '-')}.pdf`,
                id: resData.fileId || "",
                date: slipDateVal,
                url: resData.fileUrl || "#",
                formData: JSON.stringify(savedData)
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
        if (!navigator.onLine || /fetch|network|load failed/i.test(String(e && e.message))) {
            alert("⚠️ PDF download ho gaya, lekin slip server par SAVE nahi hui (internet/connection problem).\nInternet check karke dobara FINALIZE dabayein.");
        } else {
            alert("PDF Error: " + e.message);
        }
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
    setAdvanceBy(d.advanceBy || 'PARTY');
    document.getElementById('slip_dPrice').value = d.driverPrice || 0;
    document.getElementById('slip_insurance').value = d.insurance || 0;
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
    // Agar Total Freight haath se likha gaya tha to wahi wapas laao
    if (d.totalFreight !== undefined && d.totalFreight !== '' && stripNum(d.totalFreight) !== rawVal('slip_freight')) {
        document.getElementById('slip_freight').value = d.totalFreight;
        updateFinalNetPayable();
    }
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
    const toPay = fmtIN(d.toPay || "0");
    const advAmt = parseFloat(stripNum(d.advance)) || 0;
    const totalFrt = parseFloat(stripNum(d.totalFreight)) || 0;
    const frtLine = totalFrt > 0 ? `\n📦 Total Freight: ₹${fmtIN(totalFrt)}` : "";
    const advLine = advAmt > 0 ? `\n💵 Advance: ₹${fmtIN(advAmt)} (${d.advanceBy === 'ATC' ? 'ATC ne diya' : 'Party ne diya'})` : "";
    const pdfUrl = (slip.url && slip.url !== '#' && slip.url !== '') ? slip.url : "";

    let targetPhone = d.ownerMob || d.driverMob || "";
    let cleanPhone = formatWhatsAppPhone(targetPhone);

    const messageText = `🏢 *ALLINDIA TRANSPORT COMPANY*
_Vegetable Suppliers - Loading Slip_
==========================
🚚 Vehicle: *${vNo}*
📅 Date: ${tDate}
🛣️ Route: ${from} ➔ ${to}
🏢 Party: ${party}${frtLine}${advLine}

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

// ================= 🧠 SMART AUTO-FILL & SUGGESTIONS =================
// Pehle bani hui slips se: (1) gaadi number daalte hi owner/driver details auto-fill,
// (2) har field me pehle type kiye hue naam/gaon/mobile ke suggestions.
const PROFILE_MAP = [   // [profileKey, slipFormKey, inputId]
    ['lOwner',   'lorryOwner',   'slip_lOwner'],
    ['oVillage', 'ownerVillage', 'slip_oVillage'],
    ['oMob',     'ownerMob',     'slip_oMob'],
    ['dName',    'driverName',   'slip_dName'],
    ['dVillage', 'driverVillage','slip_dVillage'],
    ['dMob',     'driverMob',    'slip_dMob'],
    ['licence',  'licenceNo',    'slip_licence']
];
const SUGGEST_FIELDS = [ // [inputId, slipFormKey]
    ['slip_party', 'partyName'], ['slip_from', 'from'], ['slip_to', 'to'],
    ['slip_lOwner', 'lorryOwner'], ['slip_oVillage', 'ownerVillage'], ['slip_oMob', 'ownerMob'],
    ['slip_dName', 'driverName'], ['slip_dVillage', 'driverVillage'], ['slip_dMob', 'driverMob'],
    ['slip_licence', 'licenceNo']
];

window.vehicleProfiles = (function () {
    try { return JSON.parse(localStorage.getItem('atc_vehicle_profiles') || '{}') || {}; } catch (e) { return {}; }
})();
window.ownerMap = {};
window.driverMap = {};
window.serverVehicles = [];
window._autoKey = null;
window._autoSnap = null;

function vKey(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function saveProfilesLS() {
    try { localStorage.setItem('atc_vehicle_profiles', JSON.stringify(window.vehicleProfiles)); } catch (e) {}
}

function rebuildSuggestions() {
    const slips = window.currentSlipHistory || [];   // newest first
    const hist = {};
    const counts = {};
    const owners = {}, drivers = {};
    SUGGEST_FIELDS.forEach(f => counts[f[0]] = {});

    slips.forEach(slip => {
        let d = {};
        try { d = JSON.parse(slip.formData || '{}') || {}; } catch (e) { return; }

        const key = vKey(d.vNo);
        if (key) {
            const p = hist[key] || (hist[key] = { vNo: String(d.vNo).toUpperCase().trim() });
            PROFILE_MAP.forEach(m => { if (!p[m[0]] && d[m[1]]) p[m[0]] = String(d[m[1]]).trim(); });
        }
        SUGGEST_FIELDS.forEach(f => {
            const v = String(d[f[1]] || '').trim().toUpperCase();
            if (v) counts[f[0]][v] = (counts[f[0]][v] || 0) + 1;
        });
        const on = String(d.lorryOwner || '').trim().toUpperCase();
        if (on && !owners[on]) owners[on] = { oVillage: d.ownerVillage || '', oMob: d.ownerMob || '' };
        const dn = String(d.driverName || '').trim().toUpperCase();
        if (dn && !drivers[dn]) drivers[dn] = { dVillage: d.driverVillage || '', dMob: d.driverMob || '', licence: d.licenceNo || '' };
    });

    // purani cached profiles + nayi history merge (history ko priority)
    Object.keys(hist).forEach(k => {
        window.vehicleProfiles[k] = Object.assign({}, window.vehicleProfiles[k] || {}, hist[k]);
    });
    window.ownerMap = owners;
    window.driverMap = drivers;
    saveProfilesLS();

    // datalists (har field ke liye)
    SUGGEST_FIELDS.forEach(f => {
        const id = 'dl_' + f[0];
        let dl = document.getElementById(id);
        if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
        const vals = Object.keys(counts[f[0]]).sort((a, b) => counts[f[0]][b] - counts[f[0]][a]);
        dl.innerHTML = vals.map(v => `<option value="${safeAttr(v)}">`).join('');
        const inp = document.getElementById(f[0]);
        if (inp) { inp.setAttribute('list', id); inp.setAttribute('autocomplete', 'off'); }
    });
    renderVehicleList();
}

function renderVehicleList() {
    const list = document.getElementById('vehicleListOptions');
    if (!list) return;
    const seen = new Map();
    Object.keys(window.vehicleProfiles).forEach(k => {
        const p = window.vehicleProfiles[k];
        if (p && p.vNo) seen.set(k, p);
    });
    (window.serverVehicles || []).forEach(v => {
        const k = vKey(v);
        if (k && !seen.has(k)) seen.set(k, { vNo: v });
    });
    const items = [...seen.values()].sort((a, b) => String(a.vNo).localeCompare(String(b.vNo)));
    list.innerHTML = items.map(p => `<option value="${safeAttr(p.vNo)}"${p.lOwner ? ` label="${safeAttr(p.lOwner)}"` : ''}>`).join('');
    const vIn = document.getElementById('slip_vNo');
    if (vIn) { vIn.setAttribute('list', 'vehicleListOptions'); vIn.setAttribute('autocomplete', 'off'); }
}

function profileSnapshot() {
    return PROFILE_MAP.map(m => (document.getElementById(m[2]).value || '')).join('|');
}

function markAutoFilled(key) {
    window._autoKey = key;
    window._autoSnap = profileSnapshot();
}

function applyVehicleProfile(p, onlyEmpty) {
    PROFILE_MAP.forEach(m => {
        const el = document.getElementById(m[2]);
        if (!el || !p[m[0]]) return;
        if (onlyEmpty && el.value.trim()) return;
        el.value = p[m[0]];
    });
}

function showAutoHint(msg, ok) {
    let el = document.getElementById('autoFillHint');
    if (!el) {
        const grp = document.getElementById('slipSearchVNo') && document.getElementById('slipSearchVNo').closest('.input-group');
        if (!grp) return;
        el = document.createElement('div');
        el.id = 'autoFillHint';
        el.style.cssText = 'font-size:12px; font-weight:600; margin-top:6px;';
        grp.insertAdjacentElement('afterend', el);
    }
    el.textContent = msg || '';
    el.style.color = ok ? '#198754' : '#6c757d';
}

// Gaadi number type karte hi (ya list se chunte hi) auto-fill
document.addEventListener('input', function (e) {
    if (e.target.id !== 'slip_vNo') return;
    const key = vKey(e.target.value);
    const editing = !!document.getElementById('slip_archiveRow').value;
    if (key === window._autoKey) return;

    // Pichli gaadi ki auto-filled details (agar haath se badli nahi) hata do, taaki galat owner na rahe
    if (window._autoKey && !editing && profileSnapshot() === window._autoSnap) {
        PROFILE_MAP.forEach(m => { document.getElementById(m[2]).value = ''; });
        window._autoKey = null; window._autoSnap = null;
        showAutoHint('');
    }
    if (key.length < 6) return;
    const p = window.vehicleProfiles[key];
    if (p) {
        applyVehicleProfile(p, editing);
        markAutoFilled(key);
        showAutoHint('✅ Pichli slip se Owner/Driver details bhar di gayi', true);
    }
});

// Owner / Driver ka naam chunte hi uska gaon, mobile (aur licence) bhar do (sirf khali fields me)
document.addEventListener('change', function (e) {
    const fillEmpty = (id, val) => {
        const el = document.getElementById(id);
        if (el && val && !el.value.trim()) el.value = val;
    };
    if (e.target.id === 'slip_lOwner') {
        const o = window.ownerMap[String(e.target.value).trim().toUpperCase()];
        if (o) { fillEmpty('slip_oVillage', o.oVillage); fillEmpty('slip_oMob', o.oMob); }
    }
    if (e.target.id === 'slip_dName') {
        const d = window.driverMap[String(e.target.value).trim().toUpperCase()];
        if (d) { fillEmpty('slip_dVillage', d.dVillage); fillEmpty('slip_dMob', d.dMob); fillEmpty('slip_licence', d.licence); }
    }
});


// ================= 💰 INDIAN COMMA FORMAT (5,000 | 1,00,000) =================
const AMOUNT_IDS  = ['slip_rate', 'slip_dPrice', 'slip_freightAmt', 'slip_overloadRate', 'slip_overloadAmt', 'slip_insurance', 'slip_freight', 'slip_advance', 'slip_toPay'];
const AMOUNT_EDIT = ['slip_rate', 'slip_dPrice', 'slip_overloadRate', 'slip_insurance', 'slip_freight', 'slip_advance'];

function stripNum(v) { return String(v == null ? '' : v).replace(/,/g, '').trim(); }
function numVal(id) { const n = parseFloat(stripNum(document.getElementById(id).value)); return isNaN(n) ? 0 : n; }
function rawVal(id) { return stripNum(document.getElementById(id).value); }

function groupIN(intStr) {
    if (intStr.length <= 3) return intStr;
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
}
function fmtIN(v) {
    let s = stripNum(v);
    if (s === '' || s === '-') return s;
    const neg = s[0] === '-';
    s = s.replace('-', '');
    const parts = s.split('.');
    const intPart = groupIN(parts[0].replace(/\D/g, '') || '0');
    return (neg ? '-' : '') + intPart + (parts.length > 1 ? '.' + parts[1].replace(/\D/g, '') : '');
}
function formatAllAmounts() {
    AMOUNT_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && el !== document.activeElement) el.value = fmtIN(el.value);
    });
}

// Type karte waqt hi comma lagte jaayein (cursor apni jagah rahe)
document.addEventListener('input', function (e) {
    const el = e.target;
    if (!AMOUNT_EDIT.includes(el.id)) return;
    const pos = el.selectionStart;
    const digitsBefore = el.value.slice(0, pos).replace(/[^\d.]/g, '').length;
    let raw = el.value.replace(/[^\d.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    const f = fmtIN(raw);
    el.value = f;
    let cnt = 0, np = 0;
    while (np < f.length && cnt < digitsBefore) { if (/[\d.]/.test(f[np])) cnt++; np++; }
    try { el.setSelectionRange(np, np); } catch (err) {}
});
// Field se bahar jaate hi bhi poora format
document.addEventListener('focusout', function (e) {
    if (AMOUNT_IDS.includes(e.target.id)) e.target.value = fmtIN(e.target.value);
});
