const STORAGE_KEY = 'gt-repairs-data';
const SHOP_NAME = 'GT Computer';
const SHOP_LOCATION = 'Avigliana';

let data = { records: [], nextTicket: 1 };
let pendingCompleteId = null;
let pendingDeleteCallback = null;
let datetimeInterval = null;

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' +
         d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDeliveryDate(dateStr, slot) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  const datePart = d.toLocaleDateString('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const slotLabel = slot === 'pomeriggio' ? 'Pomeriggio' : slot === 'mattina' ? 'Mattina' : '';
  return slotLabel ? `${datePart} · ${slotLabel}` : datePart;
}

function getDeliverySlot() {
  const selected = document.querySelector('input[name="deliverySlot"]:checked');
  return selected ? selected.value : 'mattina';
}

function defaultDeliveryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function ticketLabel(n) {
  return 'GT-' + String(n).padStart(4, '0');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatNotesText(str) {
  return escapeHtml(str || '').replace(/\n/g, '<br>');
}

function buildReadyMessage(rec) {
  const device = rec.deviceModel ? `${rec.deviceType} (${rec.deviceModel})` : rec.deviceType;
  return `Gentile ${rec.customerName}, il Suo ${device} (ticket ${ticketLabel(rec.ticketNumber)}) è pronto per il ritiro presso ${SHOP_NAME}, ${SHOP_LOCATION}. La aspettiamo in negozio.`;
}

function notifySms(rec) {
  const phone = (rec.customerPhone || '').replace(/[\s\-()]/g, '');
  if (!phone) {
    toast('Numero di telefono non disponibile', 'danger');
    return;
  }
  const body = encodeURIComponent(buildReadyMessage(rec));
  window.location.href = `sms:${phone}?body=${body}`;
  toast('Apertura app messaggi…');
}

function notifyEmail(rec) {
  if (!rec.customerEmail) {
    toast('Email cliente non indicata — aggiungila in registrazione', 'danger');
    return;
  }
  const subject = encodeURIComponent(`${SHOP_NAME} — Dispositivo pronto (${ticketLabel(rec.ticketNumber)})`);
  const body = encodeURIComponent(buildReadyMessage(rec));
  window.location.href = `mailto:${encodeURIComponent(rec.customerEmail)}?subject=${subject}&body=${body}`;
  toast('Apertura client email…');
}

function updateCompleteNotifyButtons() {
  const rec = data.records.find(r => r.id === pendingCompleteId);
  const emailBtn = document.getElementById('completeNotifyEmail');
  if (emailBtn) {
    emailBtn.disabled = !rec?.customerEmail;
    emailBtn.title = rec?.customerEmail ? '' : 'Email cliente non indicata';
  }
}

function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = '.25s ease';
    setTimeout(() => el.remove(), 250);
  }, 2800);
}

async function loadData() {
  try {
    if (window.storage?.get) {
      const res = await window.storage.get(STORAGE_KEY, false);
      if (res?.value) {
        data = JSON.parse(res.value);
        render();
        return;
      }
    }
  } catch (_) {}

  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) data = JSON.parse(local);
  } catch (_) {
    data = { records: [], nextTicket: 1 };
  }
  render();
}

async function saveData() {
  const json = JSON.stringify(data);
  try {
    if (window.storage?.set) {
      await window.storage.set(STORAGE_KEY, json, false);
    }
  } catch (_) {}
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.error('Errore salvataggio', e);
  }
}

function render() {
  const searchTerm = document.getElementById('searchBox').value.trim().toLowerCase();
  const active = data.records.filter(r => r.status === 'active');
  const completed = data.records.filter(r => r.status === 'completed')
    .sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted));

  document.getElementById('statActive').textContent = active.length;
  document.getElementById('statDone').textContent = completed.length;
  const revenue = completed.reduce((s, r) => s + (r.price || 0), 0);
  document.getElementById('statRevenue').textContent = '€' + revenue.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  document.getElementById('histCount').textContent = completed.length;

  const filteredActive = active.filter(r => {
    if (!searchTerm) return true;
    const hay = (r.customerName + ' ' + r.deviceType + ' ' + r.deviceModel + ' ' + r.customerPhone + ' ' + (r.customerEmail || '')).toLowerCase();
    return hay.includes(searchTerm);
  }).sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));

  const grid = document.getElementById('activeGrid');
  grid.innerHTML = '';
  document.getElementById('emptyState').style.display = filteredActive.length === 0 ? 'block' : 'none';

  filteredActive.forEach((r, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style.animationDelay = (i * 40) + 'ms';
    const phoneClean = (r.customerPhone || '').replace(/[\s\-()]/g, '');
    const deliveryText = fmtDeliveryDate(r.deliveryDate, r.deliverySlot);
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="ticket-id">${ticketLabel(r.ticketNumber)}</div>
          <div class="ticket-date">Entrato: ${fmtDate(r.dateAdded)}</div>
        </div>
        <span class="badge">In corso</span>
      </div>
      <h3 class="device-name">${escapeHtml(r.deviceType)}</h3>
      <div class="device-model">${r.deviceModel ? escapeHtml(r.deviceModel) : '—'}</div>
      <div class="reason-box">${escapeHtml(r.reason)}</div>
      ${r.notes ? `<div class="notes-box"><div class="notes-label">Note aggiuntive</div><div class="notes-text">${formatNotesText(r.notes)}</div></div>` : ''}
      <div class="delivery-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span>Consegna prevista: <strong>${escapeHtml(deliveryText)}</strong></span>
      </div>
      <div class="customer">
        <div class="customer-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="customer-info">
          <div class="customer-name">${escapeHtml(r.customerName)}</div>
          <div class="customer-phone">${phoneClean ? `<a href="tel:${escapeHtml(phoneClean)}">${escapeHtml(r.customerPhone)}</a>` : escapeHtml(r.customerPhone)}</div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn-ghost" data-action="edit" data-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
          Modifica
        </button>
        <button class="btn-notify" data-action="notes" data-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h10"/><path d="M7 12h7"/><path d="M7 17h5"/><path d="M4 4h16v16H4z"/></svg>
          Note
        </button>
        <button class="btn-success" data-action="complete" data-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
          Completa
        </button>
        <button class="btn-danger" data-action="delete" data-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Elimina
        </button>
      </div>
      <div class="card-actions">
        <button class="btn-notify" data-action="notify-sms" data-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Avvisa SMS
        </button>
        <button class="btn-notify" data-action="notify-email" data-id="${r.id}" ${r.customerEmail ? '' : 'disabled title="Email non indicata"'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          Avvisa email
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  const histBody = document.getElementById('historyBody');
  histBody.innerHTML = '';
  completed.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ticketLabel(r.ticketNumber)}</td>
      <td>${escapeHtml(r.deviceType)}${r.deviceModel ? ' — ' + escapeHtml(r.deviceModel) : ''}</td>
      <td>${escapeHtml(r.customerName)}</td>
      <td class="hist-date">${fmtDate(r.dateAdded)}</td>
      <td class="hist-date">${fmtDate(r.dateCompleted)}</td>
      <td class="price">€${(r.price || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td><button class="hist-del" data-action="delete-history" data-id="${r.id}" aria-label="Rimuovi dallo storico">&times;</button></td>
    `;
    histBody.appendChild(tr);
  });
}

function updateDatetimePreview() {
  document.getElementById('datetimePreview').textContent =
    'Ingresso in laboratorio: ' + fmtDate(new Date().toISOString());
}

function resetRecordForm() {
  document.getElementById('fDeviceType').value = 'PC Desktop';
  document.getElementById('fDeviceModel').value = '';
  document.getElementById('fReason').value = '';
  document.getElementById('fCustomer').value = '';
  document.getElementById('fPhone').value = '';
  document.getElementById('fEmail').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('fDeliveryDate').value = defaultDeliveryDate();
  document.querySelector('input[name="deliverySlot"][value="mattina"]').checked = true;
}

function populateRecordForm(rec) {
  document.getElementById('fDeviceType').value = rec.deviceType || 'PC Desktop';
  document.getElementById('fDeviceModel').value = rec.deviceModel || '';
  document.getElementById('fReason').value = rec.reason || '';
  document.getElementById('fCustomer').value = rec.customerName || '';
  document.getElementById('fPhone').value = rec.customerPhone || '';
  document.getElementById('fEmail').value = rec.customerEmail || '';
  document.getElementById('fNotes').value = rec.notes || '';
  document.getElementById('fDeliveryDate').value = rec.deliveryDate || defaultDeliveryDate();
  const slot = rec.deliverySlot || 'mattina';
  document.querySelectorAll('input[name="deliverySlot"]').forEach(el => {
    el.checked = el.value === slot;
  });
}

function openAddModal() {
  const overlay = document.getElementById('addOverlay');
  overlay.dataset.mode = 'create';
  overlay.dataset.recordId = '';
  document.getElementById('addTitle').textContent = 'Nuovo dispositivo in riparazione';
  document.getElementById('confirmAddBtn').textContent = 'Registra dispositivo';
  resetRecordForm();
  document.getElementById('formErr').style.display = 'none';
  updateDatetimePreview();
  overlay.style.display = 'flex';
  clearInterval(datetimeInterval);
  datetimeInterval = setInterval(updateDatetimePreview, 30000);
  setTimeout(() => document.getElementById('fReason').focus(), 100);
}

function openEditModal(recordId, focusNotes = false) {
  const rec = data.records.find(r => r.id === recordId);
  if (!rec) return;
  const overlay = document.getElementById('addOverlay');
  overlay.dataset.mode = 'edit';
  overlay.dataset.recordId = recordId;
  document.getElementById('addTitle').textContent = 'Modifica dispositivo in riparazione';
  document.getElementById('confirmAddBtn').textContent = 'Salva modifiche';
  populateRecordForm(rec);
  document.getElementById('formErr').style.display = 'none';
  updateDatetimePreview();
  overlay.style.display = 'flex';
  clearInterval(datetimeInterval);
  datetimeInterval = setInterval(updateDatetimePreview, 30000);
  setTimeout(() => {
    if (focusNotes) {
      document.getElementById('fNotes').focus();
      document.getElementById('fNotes').select();
    } else {
      document.getElementById('fReason').focus();
    }
  }, 100);
}

function closeAddModal() {
  const overlay = document.getElementById('addOverlay');
  overlay.style.display = 'none';
  overlay.dataset.mode = 'create';
  overlay.dataset.recordId = '';
  document.getElementById('addTitle').textContent = 'Nuovo dispositivo in riparazione';
  document.getElementById('confirmAddBtn').textContent = 'Registra dispositivo';
  clearInterval(datetimeInterval);
}

function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  pendingDeleteCallback = onConfirm;
  document.getElementById('confirmOverlay').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirmOverlay').style.display = 'none';
  pendingDeleteCallback = null;
}

function toggleHistory() {
  const box = document.getElementById('historyBox');
  const toggle = document.getElementById('historyToggle');
  const isOpen = box.style.display !== 'none';
  box.style.display = isOpen ? 'none' : 'block';
  toggle.classList.toggle('open', !isOpen);
  toggle.setAttribute('aria-expanded', String(!isOpen));
}

document.getElementById('openAddBtn').addEventListener('click', openAddModal);
document.getElementById('fabAddBtn').addEventListener('click', openAddModal);
document.getElementById('cancelAddBtn').addEventListener('click', closeAddModal);

document.getElementById('confirmAddBtn').addEventListener('click', async () => {
  const deviceType = document.getElementById('fDeviceType').value;
  const deviceModel = document.getElementById('fDeviceModel').value.trim();
  const reason = document.getElementById('fReason').value.trim();
  const customerName = document.getElementById('fCustomer').value.trim();
  const customerPhone = document.getElementById('fPhone').value.trim();
  const customerEmail = document.getElementById('fEmail').value.trim();
  const notes = document.getElementById('fNotes').value.trim();
  const deliveryDate = document.getElementById('fDeliveryDate').value;
  const deliverySlot = getDeliverySlot();
  const overlay = document.getElementById('addOverlay');
  const editId = overlay.dataset.recordId;

  if (!reason || !customerName || !customerPhone || !deliveryDate) {
    document.getElementById('formErr').style.display = 'block';
    return;
  }

  if (editId) {
    const rec = data.records.find(r => r.id === editId);
    if (!rec) return;
    rec.deviceType = deviceType;
    rec.deviceModel = deviceModel;
    rec.reason = reason;
    rec.customerName = customerName;
    rec.customerPhone = customerPhone;
    rec.customerEmail = customerEmail || null;
    rec.notes = notes;
    rec.deliveryDate = deliveryDate;
    rec.deliverySlot = deliverySlot;
    await saveData();
    closeAddModal();
    render();
    toast('Registrazione aggiornata — ' + ticketLabel(rec.ticketNumber));
    return;
  }

  const record = {
    id: 'r' + Date.now() + Math.random().toString(36).slice(2, 8),
    ticketNumber: data.nextTicket,
    deviceType, deviceModel, reason, customerName, customerPhone,
    customerEmail: customerEmail || null,
    notes,
    deliveryDate, deliverySlot,
    dateAdded: new Date().toISOString(),
    status: 'active',
    price: null,
    dateCompleted: null
  };
  data.nextTicket += 1;
  data.records.push(record);
  await saveData();
  closeAddModal();
  render();
  toast('Dispositivo registrato — ' + ticketLabel(record.ticketNumber));
});

document.getElementById('activeGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const rec = data.records.find(r => r.id === id);
  if (!rec) return;

  if (action === 'edit') {
    openEditModal(id);
  } else if (action === 'notes') {
    openEditModal(id, true);
  } else if (action === 'complete') {
    pendingCompleteId = id;
    document.getElementById('fPrice').value = '';
    document.getElementById('priceErr').style.display = 'none';
    updateCompleteNotifyButtons();
    document.getElementById('priceOverlay').style.display = 'flex';
    setTimeout(() => document.getElementById('fPrice').focus(), 100);
  } else if (action === 'delete') {
    showConfirm(
      'Elimina dispositivo',
      `Vuoi rimuovere ${rec.deviceType + ' di ' + rec.customerName} dalla lista? L'operazione non può essere annullata.`,
      async () => {
        data.records = data.records.filter(r => r.id !== id);
        await saveData();
        render();
        toast('Dispositivo eliminato', 'danger');
      }
    );
  } else if (action === 'notify-sms') {
    notifySms(rec);
  } else if (action === 'notify-email') {
    notifyEmail(rec);
  }
});

document.getElementById('completeNotifySms').addEventListener('click', () => {
  const rec = data.records.find(r => r.id === pendingCompleteId);
  if (rec) notifySms(rec);
});

document.getElementById('completeNotifyEmail').addEventListener('click', () => {
  const rec = data.records.find(r => r.id === pendingCompleteId);
  if (rec) notifyEmail(rec);
});

document.getElementById('cancelPriceBtn').addEventListener('click', () => {
  document.getElementById('priceOverlay').style.display = 'none';
  pendingCompleteId = null;
});

document.getElementById('confirmPriceBtn').addEventListener('click', async () => {
  const priceVal = parseFloat(document.getElementById('fPrice').value);
  if (isNaN(priceVal) || priceVal < 0) {
    document.getElementById('priceErr').style.display = 'block';
    return;
  }
  const rec = data.records.find(r => r.id === pendingCompleteId);
  if (rec) {
    rec.status = 'completed';
    rec.price = priceVal;
    rec.dateCompleted = new Date().toISOString();
    await saveData();
    toast('Riparazione completata — ' + ticketLabel(rec.ticketNumber));
  }
  document.getElementById('priceOverlay').style.display = 'none';
  pendingCompleteId = null;
  render();
});

document.getElementById('historyBody').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || btn.dataset.action !== 'delete-history') return;
  showConfirm(
    'Rimuovi dallo storico',
    'Vuoi eliminare definitivamente questa voce dallo storico riparazioni?',
    async () => {
      data.records = data.records.filter(r => r.id !== btn.dataset.id);
      await saveData();
      render();
      toast('Voce rimossa dallo storico', 'danger');
    }
  );
});

document.getElementById('cancelConfirmBtn').addEventListener('click', closeConfirm);
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (pendingDeleteCallback) await pendingDeleteCallback();
  closeConfirm();
});

document.getElementById('historyToggle').addEventListener('click', toggleHistory);
document.getElementById('historyToggle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHistory(); }
});

document.getElementById('searchBox').addEventListener('input', render);

[document.getElementById('addOverlay'), document.getElementById('priceOverlay'), document.getElementById('confirmOverlay')].forEach(ov => {
  ov.addEventListener('click', (e) => {
    if (e.target === ov) {
      ov.style.display = 'none';
      if (ov.id === 'addOverlay') clearInterval(datetimeInterval);
      if (ov.id === 'confirmOverlay') pendingDeleteCallback = null;
      if (ov.id === 'priceOverlay') pendingCompleteId = null;
    }
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAddModal();
    document.getElementById('priceOverlay').style.display = 'none';
    closeConfirm();
    pendingCompleteId = null;
  }
});

loadData();
