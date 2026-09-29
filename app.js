const STORAGE_KEY = 'billing-tracker-platform-v1';
const ACTIVITY_LOG_STORAGE_KEY = 'billing-tracker-activity-log-v1';
const ATTACHMENT_DB_NAME = 'billing-tracker-attachments-v1';
const ATTACHMENT_STORE_NAME = 'attachments';
const parserScriptPromises = new Map();

const defaultRecords = [
  {
    id: 1,
    type: 'invoice',
    customer: 'Northwind Group',
    reference: 'INV-2041',
    issueDate: '2026-09-01',
    dueDate: '2026-09-15',
    amount: 4200,
    status: 'Outstanding',
    notes: 'IT support renewal'
  },
  {
    id: 2,
    type: 'payment',
    customer: 'BluePeak Systems',
    reference: 'RCPT-880',
    issueDate: '2026-09-06',
    dueDate: '2026-09-06',
    amount: 1800,
    status: 'Paid',
    notes: 'Settlement for August services'
  },
  {
    id: 3,
    type: 'quotation',
    customer: 'Aster Labs',
    reference: 'Q-118',
    issueDate: '2026-09-12',
    dueDate: '2026-09-20',
    amount: 2500,
    status: 'Approved',
    notes: 'Proposed migration package'
  },
  {
    id: 4,
    type: 'invoice',
    customer: 'Crest Projects',
    reference: 'INV-2054',
    issueDate: '2026-09-16',
    dueDate: '2026-09-30',
    amount: 6100,
    status: 'Paid',
    notes: 'Hardware and support items'
  },
  {
    id: 5,
    type: 'quotation',
    customer: 'Summit Retail',
    reference: 'Q-122',
    issueDate: '2026-09-18',
    dueDate: '2026-09-27',
    amount: 1300,
    status: 'Pending',
    notes: 'Consulting and onboarding'
  }
];

const state = {
  records: loadRecords(),
  activityLog: loadActivityLog(),
  selectedView: 'dashboard',
  manualFields: new Set(),
  extractedFields: new Set(),
  extractionTask: Promise.resolve(),
  extractionRequest: 0
};

const refs = {
  recentActivityBody: document.getElementById('recent-activity-body'),
  totalRevenue: document.getElementById('total-revenue'),
  collectedTotal: document.getElementById('collected-total'),
  outstandingTotal: document.getElementById('outstanding-total'),
  quotationTotal: document.getElementById('quotation-total'),
  sidebarHighlight: document.getElementById('sidebar-highlight'),
  sidebarLabel: document.getElementById('sidebar-label'),
  recordsTableBody: document.getElementById('records-table-body'),
  quotationsTableBody: document.getElementById('quotations-table-body'),
  paymentsTableBody: document.getElementById('payments-table-body'),
  activityLogBody: document.getElementById('activity-log-body'),
  exportLogButton: document.getElementById('export-log-button'),
  searchInput: document.getElementById('search-input'),
  typeFilter: document.getElementById('type-filter'),
  recordForm: document.getElementById('record-form'),
  recordFormPanel: document.getElementById('record-form-panel'),
  attachments: document.getElementById('record-attachments'),
  attachmentStatus: document.getElementById('attachment-status'),
  formMessage: document.getElementById('form-message'),
  pageTitle: document.getElementById('page-title'),
  newRecordButton: document.getElementById('new-record-button'),
  cancelRecordForm: document.getElementById('cancel-record-form'),
  monthlyChart: document.getElementById('monthly-chart'),
  navLinks: [...document.querySelectorAll('.nav-link')],
  views: [...document.querySelectorAll('.view')]
};

function loadRecords() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return defaultRecords;
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : defaultRecords;
  } catch (error) {
    return defaultRecords;
  }
}

function loadActivityLog() {
  const stored = localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function recordActivity(action, record, details = '') {
  state.activityLog.unshift({
    id: `${Date.now()}-${state.activityLog.length}`,
    timestamp: new Date().toISOString(),
    action,
    reference: record.reference,
    customer: record.customer,
    type: record.type,
    amount: Number(record.amount || 0),
    details
  });
  state.activityLog.length = Math.min(state.activityLog.length, 1000);
  localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(state.activityLog));
}

function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function openAttachmentDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ATTACHMENT_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeAttachments(attachments) {
  if (!attachments.length) return Promise.resolve();

  return openAttachmentDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(ATTACHMENT_STORE_NAME);

    attachments.forEach((attachment) => store.put(attachment));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Attachment storage was interrupted.'));
  }));
}

function removeAttachments(ids) {
  if (!ids.length) return Promise.resolve();

  return openAttachmentDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(ATTACHMENT_STORE_NAME);

    ids.forEach((id) => store.delete(id));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Attachment removal was interrupted.'));
    };
  }));
}

function downloadAttachment(id) {
  return openAttachmentDatabase().then((database) => new Promise((resolve, reject) => {
    const request = database
      .transaction(ATTACHMENT_STORE_NAME, 'readonly')
      .objectStore(ATTACHMENT_STORE_NAME)
      .get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  })).then((attachment) => {
    if (!attachment) throw new Error('This attachment could not be found.');

    const url = URL.createObjectURL(attachment.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function loadParserScript(globalName, source) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (parserScriptPromises.has(source)) return parserScriptPromises.get(source);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = source;
    script.onload = () => window[globalName]
      ? resolve(window[globalName])
      : reject(new Error('The document reader did not load.'));
    script.onerror = () => {
      parserScriptPromises.delete(source);
      reject(new Error('A document reader could not be loaded.'));
    };
    document.head.append(script);
  });

  parserScriptPromises.set(source, promise);
  return promise;
}

async function extractTextFromFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();

  if (['txt', 'csv', 'tsv', 'json', 'md', 'html', 'xml'].includes(extension)) {
    return file.text();
  }

  if (extension === 'pdf') {
    const pdfjs = await loadParserScript(
      'pdfjsLib',
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    );
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const documentTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const pdf = await documentTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 60); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let lineItems = [];
      let lineY = null;

      content.items.forEach((item) => {
        const itemY = Math.round(item.transform[5]);
        if (lineY !== null && Math.abs(itemY - lineY) > 3) {
          lines.push(lineItems.join(' '));
          lineItems = [];
        }
        lineY = itemY;
        if (item.str.trim()) lineItems.push(item.str.trim());
        if (item.hasEOL && lineItems.length) {
          lines.push(lineItems.join(' '));
          lineItems = [];
          lineY = null;
        }
      });

      if (lineItems.length) lines.push(lineItems.join(' '));
      pages.push(lines.join('\n'));
    }

    await documentTask.destroy();
    const text = pages.join('\n');
    if (!text.trim()) throw new Error('No selectable text was found.');
    return text;
  }

  if (extension === 'docx') {
    const mammoth = await loadParserScript(
      'mammoth',
      'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js'
    );
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'].includes(extension)) {
    const xlsx = await loadParserScript(
      'XLSX',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    );
    const workbook = xlsx.read(await file.arrayBuffer(), { type: 'array' });
    return workbook.SheetNames
      .map((sheetName) => xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]))
      .join('\n');
  }

  if (extension === 'doc') {
    throw new Error('Legacy .doc files are not supported. Save as .docx or enter the details manually.');
  }

  throw new Error('This file type is not supported for automatic reading.');
}

function findLabeledEntry(lines, labels) {
  const labelPattern = labels.join('|');
  const inlinePattern = new RegExp(`^\\s*(?:${labelPattern})(?:\\s*[:=,#|]\\s*|\\s+-\\s+|\\s+)(.+?)\\s*$`, 'i');
  const standalonePattern = new RegExp(`^\\s*(?:${labelPattern})\\s*[:=]?\\s*$`, 'i');

  for (let index = 0; index < lines.length; index += 1) {
    const inlineMatch = lines[index].match(inlinePattern);
    if (inlineMatch) return inlineMatch[1].trim();
    if (standalonePattern.test(lines[index]) && lines[index + 1]) {
      return lines[index + 1].trim();
    }
  }

  return '';
}

function parseDocumentDate(value) {
  const text = value.trim();
  let match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);

  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function parseDocumentAmount(value) {
  const currencyMatch = value.match(/\b(PGK|USD|AUD|NZD|SGD|EUR|GBP|JPY)\b/i);
  const hasCurrencySymbol = /[$€£¥]/.test(value);
  const hasKinaPrefix = /(?:^|\s)K\s*\d/i.test(value);
  const numberMatch = value.match(/\(?-?\s*(?:PGK|USD|AUD|NZD|SGD|EUR|GBP|JPY|K)?\s*[$€£¥]?\s*\d[\d,]*(?:\.\d{1,2})?\)?/i);

  if (!numberMatch || (currencyMatch && currencyMatch[1].toUpperCase() !== 'PGK') || (hasCurrencySymbol && !currencyMatch && !hasKinaPrefix)) {
    return { amount: '', foreignCurrency: Boolean(currencyMatch || hasCurrencySymbol) };
  }

  const amount = Number(numberMatch[0].replace(/[^\d.-]/g, ''));
  return { amount: Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : '', foreignCurrency: false };
}

function extractRecordDetails(text, fileName) {
  const lines = text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const searchableText = lines.join('\n');
  const documentHeader = `${fileName}\n${lines.slice(0, 12).join('\n')}`;
  const type = /\b(receipt|payment receipt)\b/i.test(documentHeader)
    ? 'payment'
    : /\b(quotation|quote|estimate)\b/i.test(documentHeader)
      ? 'quotation'
      : /\b(invoice|tax invoice)\b/i.test(documentHeader)
        ? 'invoice'
        : '';
  const amountLabels = [
    'amount\\s+due', 'total\\s+due', 'balance\\s+due', 'grand\\s+total',
    'total\\s+payable', 'amount\\s+payable'
  ];
  if (type) amountLabels.push(
    'invoice\\s+total',
    'total\\s+amount',
    'total(?:\\s*\\([^)]*\\))?'
  );
  const amountEntry = type ? findLabeledEntry(lines, amountLabels) : '';
  const amount = parseDocumentAmount(amountEntry);
  const fileReference = fileName.match(/\b(?:INV|INVOICE|RCPT|RECEIPT|Q|QUOTE)[-_ #]?[A-Z0-9-]{2,}\b/i);
  const statusEntry = type ? findLabeledEntry(lines, [
    'payment\\s+status', 'invoice\\s+status', 'status'
  ]) : '';
  const status = /\b(paid|settled|payment received)\b/i.test(statusEntry)
    || (type === 'payment' && /\b(paid|settled|payment received)\b/i.test(searchableText))
    ? 'Paid'
    : /\b(outstanding|unpaid|pending)\b/i.test(statusEntry)
      ? 'Outstanding'
      : '';

  return {
    type,
    customer: type ? findLabeledEntry(lines, [
      'customer(?:\\s+name)?', 'client(?:\\s+name)?', 'supplier(?:\\s+name)?',
      'vendor(?:\\s+name)?', 'merchant(?:\\s+name)?', 'payee', 'bill\\s+to',
      'billed\\s+to', 'invoice\\s+to', 'account\\s+name'
    ]) : '',
    reference: type ? findLabeledEntry(lines, [
      'invoice\\s*(?:number|no\\.?|#)', 'receipt\\s*(?:number|no\\.?|#)',
      'quotation\\s*(?:number|no\\.?|#)', 'quote\\s*(?:number|no\\.?|#)',
      'reference(?:\\s*(?:number|no\\.?|#))?'
    ]) || (fileReference ? fileReference[0] : '') : '',
    issueDate: type ? parseDocumentDate(findLabeledEntry(lines, [
      'invoice\\s+date', 'quotation\\s+date', 'quote\\s+date', 'issue\\s+date',
      'date\\s+issued', 'receipt\\s+date', 'transaction\\s+date', 'date'
    ])) : '',
    dueDate: type ? parseDocumentDate(findLabeledEntry(lines, [
      'due\\s+date', 'payment\\s+due', 'payment\\s+deadline'
    ])) : '',
    amount: amount.amount,
    foreignCurrency: amount.foreignCurrency,
    status
  };
}

async function autoFillFromAttachment() {
  const requestId = ++state.extractionRequest;
  const file = refs.attachments.files[0];
  refs.attachmentStatus.className = 'form-message';

  state.extractedFields.forEach((fieldId) => {
    if (!state.manualFields.has(fieldId)) {
      document.getElementById(fieldId).value = '';
    }
  });
  state.extractedFields.clear();

  if (!file) {
    refs.attachmentStatus.textContent = '';
    state.extractionTask = Promise.resolve();
    return;
  }

  refs.attachmentStatus.textContent = `Reading ${file.name}...`;
  state.extractionTask = (async () => {
    try {
      const details = extractRecordDetails(await extractTextFromFile(file), file.name);
      if (requestId !== state.extractionRequest) return;

      const fields = {
        type: ['record-type', details.type],
        customer: ['customer-name', details.customer],
        reference: ['reference', details.reference],
        amount: ['amount', details.amount],
        issueDate: ['issue-date', details.issueDate],
        dueDate: ['due-date', details.dueDate],
        status: ['record-status', details.status]
      };
      let extractedCount = 0;

      Object.values(fields).forEach(([fieldId, value]) => {
        if (!value) return;
        extractedCount += 1;
        if (!state.manualFields.has(fieldId)) {
          document.getElementById(fieldId).value = value;
          state.extractedFields.add(fieldId);
        }
      });

      refs.attachmentStatus.classList.add(extractedCount ? 'success' : 'error');
      refs.attachmentStatus.textContent = extractedCount
        ? `Read ${extractedCount} field${extractedCount === 1 ? '' : 's'} from ${file.name}. Review before saving.${details.foreignCurrency ? ' Amount not filled because the document is not in PGK.' : ''}`
        : `No record fields were detected in ${file.name}. Enter them manually before saving.`;
    } catch (error) {
      if (requestId !== state.extractionRequest) return;
      refs.attachmentStatus.classList.add('error');
      refs.attachmentStatus.textContent = `Could not read ${file.name}. It may be password-protected, damaged, or an unsupported format.`;
    }
  })();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-PG', {
    style: 'currency',
    currency: 'PGK',
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatDate(dateString) {
  if (!dateString) return '—';

  const date = new Date(dateString + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-PG', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function getMonthName(monthIndex) {
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(2024, monthIndex, 1));
}

function getStatistics() {
  const revenue = state.records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const collected = state.records
    .filter((record) => record.status === 'Paid' || record.status === 'Approved')
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const outstanding = state.records
    .filter((record) => record.status !== 'Paid' && record.status !== 'Approved')
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const openQuotations = state.records.filter((record) => record.type === 'quotation').length;

  return {
    revenue,
    collected,
    outstanding,
    openQuotations
  };
}

function renderDashboard() {
  const stats = getStatistics();
  refs.totalRevenue.textContent = formatCurrency(stats.revenue);
  refs.collectedTotal.textContent = formatCurrency(stats.collected);
  refs.outstandingTotal.textContent = formatCurrency(stats.outstanding);
  refs.quotationTotal.textContent = String(stats.openQuotations);
  refs.sidebarHighlight.textContent = formatCurrency(stats.collected);
  refs.sidebarLabel.textContent = 'Collected this cycle';

  const recent = [...state.records]
    .sort((a, b) => new Date(b.issueDate || 0) - new Date(a.issueDate || 0))
    .slice(0, 5);

  refs.recentActivityBody.innerHTML = recent.length
    ? recent
        .map(
          (record) => `
            <tr>
              <td>${record.reference}</td>
              <td>${record.customer}</td>
              <td>${record.type}</td>
              <td>${formatCurrency(record.amount)}</td>
              <td><span class="badge ${record.status.toLowerCase()}">${record.status}</span></td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state">No activity yet.</td></tr>';

  const monthlyTotals = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date();
    monthDate.setMonth(monthDate.getMonth() - (5 - index));
    const monthIndex = monthDate.getMonth();
    const label = getMonthName(monthIndex);
    const total = state.records
      .filter((record) => {
        if (!record.issueDate) return false;
        const date = new Date(record.issueDate + 'T00:00:00');
        return date.getMonth() === monthIndex && date.getFullYear() === monthDate.getFullYear();
      })
      .reduce((sum, record) => sum + Number(record.amount || 0), 0);

    return { label, total };
  });

  const maxValue = Math.max(...monthlyTotals.map((entry) => entry.total), 1);

  refs.monthlyChart.innerHTML = monthlyTotals
    .map(
      (entry) => `
        <div class="chart-bar-group">
          <div class="chart-bar" style="height: ${(entry.total / maxValue) * 100}%"></div>
          <span class="chart-label">${entry.label}</span>
        </div>
      `
    )
    .join('');
}

function renderRecordsTable() {
  const search = refs.searchInput.value.trim().toLowerCase();
  const typeFilter = refs.typeFilter.value;

  const filtered = state.records.filter((record) => {
    const matchesType = typeFilter === 'all' || record.type === typeFilter;
    const matchesSearch =
      !search ||
      record.customer.toLowerCase().includes(search) ||
      record.reference.toLowerCase().includes(search);

    return matchesType && matchesSearch;
  });

  refs.recordsTableBody.innerHTML = filtered.length
    ? filtered
        .map(
          (record) => `
            <tr>
              <td>${record.type}</td>
              <td>${record.reference}</td>
              <td>${record.customer}</td>
              <td>${formatDate(record.issueDate)}</td>
              <td>${formatDate(record.dueDate)}</td>
              <td>${formatCurrency(record.amount)}</td>
              <td><span class="badge ${record.status.toLowerCase()}">${record.status}</span></td>
              <td>
                <div class="attachment-list">
                  ${(record.attachments || []).map((attachment) => `
                    <button type="button" class="attachment-link" data-attachment-id="${escapeHtml(attachment.id)}">
                      ${escapeHtml(attachment.name)}
                    </button>
                  `).join('') || '—'}
                </div>
              </td>
              <td>
                <div class="record-actions">
                  <button class="action-button" data-action="mark-paid" data-id="${record.id}">Mark paid</button>
                  <button class="delete-button" data-action="delete-record" data-id="${record.id}">Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="9" class="empty-state">No matching records found.</td></tr>';
}

function renderQuotationsTable() {
  const quotations = state.records.filter((record) => record.type === 'quotation');

  refs.quotationsTableBody.innerHTML = quotations.length
    ? quotations
        .map(
          (record) => `
            <tr>
              <td>${record.reference}</td>
              <td>${record.customer}</td>
              <td>${formatDate(record.issueDate)}</td>
              <td>${formatCurrency(record.amount)}</td>
              <td><span class="badge ${record.status.toLowerCase()}">${record.status}</span></td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state">No quotations yet.</td></tr>';
}

function renderPaymentsTable() {
  const payments = state.records.filter((record) => record.type === 'payment');

  refs.paymentsTableBody.innerHTML = payments.length
    ? payments
        .map(
          (record) => `
            <tr>
              <td>${record.reference}</td>
              <td>${record.customer}</td>
              <td>${formatDate(record.issueDate)}</td>
              <td>${formatCurrency(record.amount)}</td>
              <td><span class="badge ${record.status.toLowerCase()}">${record.status}</span></td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5" class="empty-state">No payment receipts yet.</td></tr>';
}

function renderActivityLog() {
  refs.activityLogBody.innerHTML = state.activityLog.length
    ? state.activityLog.map((entry) => `
        <tr>
          <td>${formatDateTime(entry.timestamp)}</td>
          <td>${escapeHtml(entry.action)}</td>
          <td>${escapeHtml(entry.reference)}</td>
          <td>${escapeHtml(entry.customer)}</td>
          <td>${escapeHtml(entry.type)}</td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${escapeHtml(entry.details || '—')}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="7" class="empty-state">No activity has been logged yet.</td></tr>';
}

function exportActivityLog() {
  const rows = [
    ['Date and time', 'Action', 'Reference', 'Customer', 'Type', 'Amount (PGK)', 'Details'],
    ...state.activityLog.map((entry) => [
      formatDateTime(entry.timestamp),
      entry.action,
      entry.reference,
      entry.customer,
      entry.type,
      Number(entry.amount || 0).toFixed(2),
      entry.details || ''
    ])
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `billing-activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showView(viewName) {
  refs.navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  refs.views.forEach((view) => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });

  if (viewName === 'records') {
    refs.pageTitle.textContent = 'Records';
  } else if (viewName === 'dashboard') {
    refs.pageTitle.textContent = 'Dashboard';
  } else if (viewName === 'quotations') {
    refs.pageTitle.textContent = 'Quotations';
  } else if (viewName === 'payments') {
    refs.pageTitle.textContent = 'Receipts';
  } else if (viewName === 'activity-log') {
    refs.pageTitle.textContent = 'Activity log';
  }
}

function openForm() {
  showView('records');
  refs.recordFormPanel.classList.remove('hidden');
  document.getElementById('record-type').focus();
}

function closeForm() {
  state.extractionRequest += 1;
  state.manualFields.clear();
  state.extractedFields.clear();
  refs.recordForm.reset();
  refs.attachmentStatus.textContent = '';
  refs.formMessage.textContent = '';
  refs.formMessage.className = 'form-message';
  refs.recordFormPanel.classList.add('hidden');
}

async function addRecord(event) {
  event.preventDefault();
  const saveButton = refs.recordForm.querySelector('[type="submit"]');
  refs.formMessage.textContent = '';
  refs.formMessage.className = 'form-message';
  saveButton.disabled = true;

  try {
    await state.extractionTask;
    const files = Array.from(refs.attachments.files);
    const record = {
      id: Date.now(),
      type: document.getElementById('record-type').value,
      customer: document.getElementById('customer-name').value.trim(),
      reference: document.getElementById('reference').value.trim(),
      issueDate: document.getElementById('issue-date').value,
      dueDate: document.getElementById('due-date').value,
      amount: Number(document.getElementById('amount').value || 0),
      status: document.getElementById('record-status').value,
      notes: document.getElementById('notes').value.trim()
    };

    if (!record.customer || !record.reference || !record.issueDate || !record.amount) {
      return;
    }

    record.attachments = files.map((file, index) => ({
      id: `${record.id}-${index}`,
      name: file.name
    }));

    await storeAttachments(files.map((file, index) => ({
      id: `${record.id}-${index}`,
      name: file.name,
      file
    })));
    state.records.unshift(record);
    persistRecords();
    const attachmentNames = record.attachments.map((attachment) => attachment.name);
    recordActivity(
      'Record created',
      record,
      attachmentNames.length ? `Attachments: ${attachmentNames.join(', ')}` : ''
    );
    renderAll();
    closeForm();
  } catch (error) {
    refs.formMessage.classList.add('error');
    refs.formMessage.textContent = 'The record or its attachments could not be saved. Please try again.';
  } finally {
    saveButton.disabled = false;
  }
}

function markPaid(id) {
  const record = state.records.find((entry) => entry.id === id);
  if (!record || record.status === 'Paid') return;

  const previousStatus = record.status;
  state.records = state.records.map((record) => ({
    ...record,
    status: record.id === id ? 'Paid' : record.status
  }));

  persistRecords();
  recordActivity('Payment marked paid', record, `Status changed from ${previousStatus} to Paid.`);
  renderAll();
}

async function deleteRecord(id) {
  const record = state.records.find((entry) => entry.id === id);
  if (!record || !window.confirm(`Delete record ${record.reference}? This cannot be undone.`)) return;

  await removeAttachments((record.attachments || []).map((attachment) => attachment.id));
  state.records = state.records.filter((entry) => entry.id !== id);
  persistRecords();
  recordActivity('Record deleted', record);
  renderAll();
}

refs.navLinks.forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view));
});

refs.newRecordButton.addEventListener('click', openForm);
refs.cancelRecordForm.addEventListener('click', closeForm);
refs.exportLogButton.addEventListener('click', exportActivityLog);
refs.recordForm.addEventListener('submit', addRecord);
refs.attachments.addEventListener('change', autoFillFromAttachment);
['record-type', 'customer-name', 'reference', 'amount', 'issue-date', 'due-date', 'record-status', 'notes']
  .forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    field.addEventListener('input', () => state.manualFields.add(fieldId));
    field.addEventListener('change', () => state.manualFields.add(fieldId));
  });
refs.searchInput.addEventListener('input', renderRecordsTable);
refs.typeFilter.addEventListener('change', renderRecordsTable);

refs.recordsTableBody.addEventListener('click', (event) => {
  const attachmentButton = event.target.closest('[data-attachment-id]');
  if (attachmentButton) {
    downloadAttachment(attachmentButton.dataset.attachmentId).catch(() => {
      window.alert('This attachment could not be downloaded.');
    });
    return;
  }

  const deleteButton = event.target.closest('[data-action="delete-record"]');
  if (deleteButton) {
    deleteRecord(Number(deleteButton.dataset.id)).catch(() => {
      window.alert('The record could not be deleted. Please try again.');
    });
    return;
  }

  const actionButton = event.target.closest('[data-action="mark-paid"]');

  if (!actionButton) return;

  const recordId = Number(actionButton.dataset.id);
  markPaid(recordId);
});

function renderAll() {
  renderDashboard();
  renderRecordsTable();
  renderQuotationsTable();
  renderPaymentsTable();
  renderActivityLog();
}

renderAll();
showView('dashboard');
