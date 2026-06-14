if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker Registered!'))
      .catch(err => console.log('Service Worker Failed!', err));
  });
}

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw0qusUPFVNAb-lbHwfvs1eBiVh3Z4hthQMNk6QbR1Etw05A9jxcD7nqKGHLlLHp5Ys/exec";

// 1. Current Date
window.onload = () => {
    let d = new Date();
    document.getElementById('date').value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// 2. Format Vehicle Number
document.getElementById('vehicleNo').addEventListener('input', (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let r = "";
    if (v.length > 0) r += v.substring(0, 2);
    if (v.length > 2) r += " " + v.substring(2, 4);
    if (v.length > 4) r += " " + v.substring(4, 6);
    if (v.length > 6) r += " " + v.substring(6, 10);
    e.target.value = r.trim();
});

// 3. Timing Suffix
document.getElementById('timing').addEventListener('blur', function() {
    let val = this.value.trim();
    if(val !== "" && !val.toUpperCase().includes('HR')) {
        this.value = val + " Hr";
    }
});

// 4. Calculations
function calculate() {
    let rate = parseFloat(document.getElementById('rate').value) || 0;
    let weight = parseFloat(document.getElementById('weight').value) || 0;
    let advance = parseFloat(document.getElementById('advance').value) || 0;
    let driverPrice = parseFloat(document.getElementById('driverPrice').value) || 0;

    let freight = (weight) * rate; // Weight is in KG, Rate is per Ton
    let balance = (freight - advance) + driverPrice;

    document.getElementById('freight').value = Math.round(freight).toLocaleString('en-IN');
    document.getElementById('toPay').value = Math.round(balance).toLocaleString('en-IN');
}
document.querySelectorAll('.calc-in').forEach(i => i.addEventListener('input', calculate));

// 5. Generate PDF and Save Data
document.getElementById('receiptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveBtn');
    btn.innerText = "SAVING & GENERATING PDF...";
    btn.disabled = true;

    const data = {
        vehicleNo: document.getElementById('vehicleNo').value,
        date: document.getElementById('date').value,
        partyName: document.getElementById('partyName').value,
        from: document.getElementById('from').value,
        to: document.getElementById('to').value,
        lorryOwner: document.getElementById('lorryOwner').value,
        ownerMob: document.getElementById('ownerMob').value,
        ownerVillage: document.getElementById('ownerVillage').value,
        driverName: document.getElementById('driverName').value,
        driverMob: document.getElementById('driverMob').value,
        driverVillage: document.getElementById('driverVillage').value,
        licenceNo: document.getElementById('licenceNo').value,
        rate: document.getElementById('rate').value,
        weight: document.getElementById('weight').value,
        freight: document.getElementById('freight').value,
        advance: document.getElementById('advance').value,
        timing: document.getElementById('timing').value,
        driverPrice: document.getElementById('driverPrice').value,
        toPay: document.getElementById('toPay').value
    };

    try {
        // Step 1: Send to Google Sheet
        await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(data) });

        // Step 2: Perfect PDF Generation
        const element = document.getElementById('receipt');
        const opt = {
            margin: 0,
            filename: 'ATC_Receipt_' + data.vehicleNo + '.pdf',
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { 
                scale: 2, 
                useCORS: true, 
                letterRendering: true,
                scrollY: 0,
                windowWidth: 800 // Mobile par hote hue bhi 'canvas' 800px hi maanega
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: 'avoid-all' }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            alert("Success! Data Saved & PDF Downloaded.");
            location.reload();
        });

    } catch (err) {
        alert("Error! Please check internet connection.");
        btn.disabled = false;
        btn.innerText = "FINALIZE & DOWNLOAD PDF";
    }
});