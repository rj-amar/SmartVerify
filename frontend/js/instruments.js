/**
 * Online Verification System - Instruments Management Module
 */

const Instruments = {
  list: [],

  async loadInstruments(search = '') {
    const container = document.getElementById('instruments-table-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading registered instruments from database...</p></div>';

    let url = '/instruments?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await apiRequest(url);
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><i class="bi bi-exclamation-triangle"></i><p>${res.data.error || 'Failed to load instruments.'}</p></div>`;
      return;
    }

    this.list = Array.isArray(res.data?.instruments) ? res.data.instruments : [];
    this.renderInstrumentsTable();
  },

  renderInstrumentsTable() {
    const container = document.getElementById('instruments-table-container');
    if (!container) return;

    if (this.list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-scale"></i>
          <h4>No instruments registered yet.</h4>
          <p>Register your weighing or measuring device to begin the statutory verification process.</p>
          <button class="btn btn-primary" style="margin-top: 14px;" onclick="Instruments.openRegisterModal()">
            <i class="bi bi-plus-circle"></i> Register New Instrument
          </button>
        </div>
      `;
      return;
    }

    const rows = this.list.map(inst => `
      <tr>
        <td>
          <strong style="color:var(--primary); font-family:monospace; font-size:0.95rem;">
            ${inst.system_serial_number}
          </strong>
        </td>
        <td>
          <div style="font-weight:600;">${inst.instrument_type}</div>
          <small style="color:var(--text-muted);">${inst.category}</small>
        </td>
        <td>
          <div>${inst.manufacturer}</div>
          <small style="color:var(--text-muted);">Model: ${inst.model_number}</small>
        </td>
        <td>
          <strong>${inst.capacity} ${inst.unit_of_measurement}</strong>
          <div><small class="badge badge-secondary">${inst.accuracy_class}</small></div>
        </td>
        <td>
          <div>${inst.installation_place}</div>
          <small style="color:var(--text-muted);">${formatDate(inst.purchase_date)}</small>
        </td>
        <td>${getStatusBadge(inst.status)}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="Instruments.viewDetails(${inst.id})">
            <i class="bi bi-eye"></i> Details
          </button>
          ${this.renderLifecycleActions(inst)}        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>System Serial No.</th>
              <th>Type & Category</th>
              <th>Manufacturer & Model</th>
              <th>Capacity & Class</th>
              <th>Installation & Purchase</th>
              <th>Status</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  renderLifecycleActions(inst) {
    const status = String(inst.status || '').toLowerCase();
    const certExpiry = inst.latest_certificate_expiry_date ? new Date(inst.latest_certificate_expiry_date) : null;
    const now = new Date();
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const certActive = !!inst.latest_certificate_id && String(inst.latest_certificate_status || '').toLowerCase() === 'valid' && certExpiry && certExpiry >= now;
    const certExpiring = certActive && certExpiry <= thirtyDays;

    if (status === 'verified' && inst.latest_certificate_id) {
      return `
        <button class="btn btn-outline btn-sm" onclick="Certificates.openRenewModal(${inst.latest_certificate_id})" style="margin-left:6px;">
          <i class="bi bi-arrow-repeat"></i> ${certExpiring ? 'Renew Soon' : 'Renew'}
        </button>
        <button class="btn btn-primary btn-sm" onclick="Instruments.startReverification(${inst.id})" style="margin-left:6px;">
          <i class="bi bi-shield-check"></i> Re-verify
        </button>`;
    }

    if (status === 'registered' || status === 'rejected' || status === 'expired') {
      return `
        <button class="btn btn-primary btn-sm" onclick="Applications.openNewWizard(${inst.id}, '${status === 'expired' ? 'renewal' : 'initial'}')" style="margin-left:6px;">
          <i class="bi bi-send-check"></i> ${status === 'expired' ? 'Renew Verification' : 'Apply'}
        </button>`;
    }

    if (status === 'pending_verification') {
      return `<span class="badge badge-info" style="margin-left:6px;"><i class="bi bi-hourglass-split"></i> In Progress</span>`;
    }

    return '';
  },

  async startReverification(instrumentId) {
    if (!window.Applications || typeof Applications.openNewWizard !== 'function') {
      showToast('Re-verification module is unavailable. Please refresh the page.', 'danger');
      return;
    }
    await Applications.openNewWizard(instrumentId, 'reverification');
  },

  openRegisterModal() {
    const categoryOptions = CONFIG.INSTRUMENT_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    const unitOptions = CONFIG.UNITS.map(u => `<option value="${u}">${u}</option>`).join('');
    const classOptions = CONFIG.ACCURACY_CLASSES.map(ac => `<option value="${ac}">${ac}</option>`).join('');

    const modalHtml = `
      <div class="modal-backdrop" id="inst-register-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-plus-square-dotted"></i> Register New Weighing / Measuring Instrument</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form id="inst-form" onsubmit="Instruments.handleRegister(event)">
            <div class="modal-body">
              <div class="alert alert-info" style="background:#EFF6FF; border:1px solid #BFDBFE; padding:12px 16px; border-radius:6px; font-size:0.85rem; margin-bottom:16px; color:#1E40AF;">
                <i class="bi bi-info-circle-fill"></i>
                <strong>Notice on System Serial Numbers:</strong> The official System Serial Number (e.g. <code>OVS-000001</code>) will be generated automatically and sequentially by the backend database upon submission.
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Instrument Category <span class="required">*</span></label>
                  <select id="inst-category" class="form-control" required>
                    <option value="">-- Select Category --</option>
                    ${categoryOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>Instrument Type / Description <span class="required">*</span></label>
                  <input type="text" id="inst-type" class="form-control" placeholder="e.g. Electronic Counter Scale" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Manufacturer <span class="required">*</span></label>
                  <input type="text" id="inst-manufacturer" class="form-control" placeholder="e.g. Avery India / Essae" required />
                </div>
                <div class="form-group">
                  <label>Model Number <span class="required">*</span></label>
                  <input type="text" id="inst-model" class="form-control" placeholder="e.g. DS-215" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Manufacturer's Physical Serial Number</label>
                  <input type="text" id="inst-mfg-serial" class="form-control" placeholder="Optional physical plate serial number" />
                  <div class="form-hint">Physical factory serial on instrument body</div>
                </div>
                <div class="form-group">
                  <label>Accuracy Class <span class="required">*</span></label>
                  <select id="inst-accuracy" class="form-control" required>
                    <option value="">-- Select Accuracy Class --</option>
                    ${classOptions}
                  </select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Maximum Capacity / Range <span class="required">*</span></label>
                  <input type="text" id="inst-capacity" class="form-control" placeholder="e.g. 50 or 150.0" required />
                </div>
                <div class="form-group">
                  <label>Unit of Measurement <span class="required">*</span></label>
                  <select id="inst-unit" class="form-control" required>
                    <option value="">-- Select Unit --</option>
                    ${unitOptions}
                  </select>
                  <div class="form-hint">kg, g, ton, L, mL, etc.</div>
                </div>
                <div class="form-group">
                  <label>Purchase Date <span class="required">*</span></label>
                  <input type="date" id="inst-purchase-date" class="form-control" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Place of Installation (Premises) <span class="required">*</span></label>
                  <input type="text" id="inst-place" class="form-control" placeholder="e.g. Main Retail Counter / Warehouse Bay 2" required />
                </div>
                <div class="form-group">
                  <label>Installation Address <span class="required">*</span></label>
                  <input type="text" id="inst-address" class="form-control" placeholder="Exact address where instrument is operated" required />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="btn-inst-submit">
                <i class="bi bi-cpu-fill"></i> Register Instrument
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-inst-submit');
    const category = document.getElementById('inst-category').value;
    const instrument_type = document.getElementById('inst-type').value.trim();
    const manufacturer = document.getElementById('inst-manufacturer').value.trim();
    const model_number = document.getElementById('inst-model').value.trim();
    const manufacturer_serial_number = document.getElementById('inst-mfg-serial').value.trim();
    const accuracy_class = document.getElementById('inst-accuracy').value;
    const capacity = document.getElementById('inst-capacity').value.trim();
    const unit_of_measurement = document.getElementById('inst-unit').value;
    const purchase_date = document.getElementById('inst-purchase-date').value;
    const installation_place = document.getElementById('inst-place').value.trim();
    const installation_address = document.getElementById('inst-address').value.trim();

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Generating Serial & Registering...';

    const res = await apiRequest('/instruments', {
      method: 'POST',
      body: {
        category,
        instrument_type,
        manufacturer,
        model_number,
        manufacturer_serial_number: manufacturer_serial_number || null,
        accuracy_class,
        capacity,
        unit_of_measurement,
        purchase_date,
        installation_place,
        installation_address
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-cpu-fill"></i> Register Instrument';

    if (res.ok && res.data.instrument) {
      const serial = res.data.system_serial_number;
      App.closeModal();

      // Display official success alert
      const successModalHtml = `
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header" style="background:#ECFDF5; border-bottom:1px solid #A7F3D0;">
              <h3 style="color:#065F46;"><i class="bi bi-check-circle-fill"></i> Instrument Registered Successfully</h3>
            </div>
            <div class="modal-body" style="text-align:center; padding: 28px 20px;">
              <div style="font-size:3rem; color:#059669; margin-bottom:12px;">
                <i class="bi bi-patch-check-fill"></i>
              </div>
              <h4>Instrument Registered Successfully</h4>
              <p style="color:var(--text-muted); margin-top:6px;">Your device has been recorded into the Legal Metrology Registry.</p>
              
              <div style="background:#F1F5F9; border:2px dashed #0A2540; padding:16px; border-radius:8px; margin:20px 0;">
                <div style="font-size:0.8rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:600;">Official System Serial Number</div>
                <div style="font-size:1.8rem; font-weight:800; color:#0A2540; font-family:monospace; margin-top:4px;">
                  ${serial}
                </div>
              </div>

              <p style="font-size:0.85rem; color:var(--text-secondary);">
                You can now submit a verification application to schedule statutory inspection and receive your digital certificate.
              </p>
            </div>
            <div class="modal-footer" style="justify-content:center;">
              <button type="button" class="btn btn-outline" onclick="App.closeModal(); Instruments.loadInstruments();">
                View My Instruments
              </button>
              <button type="button" class="btn btn-primary" onclick="App.closeModal(); Applications.openNewWizard(${res.data.instrument.id});">
                <i class="bi bi-send-check"></i> Apply for Verification Now
              </button>
            </div>
          </div>
        </div>
      `;
      App.setModal(successModalHtml);
      this.loadInstruments();
    } else {
      showToast(res.data.error || 'Failed to register instrument.', 'danger');
    }
  },

  async viewDetails(id) {
    const res = await apiRequest(`/instruments/${id}`);
    if (!res.ok) {
      showToast(res.data.error || 'Failed to load instrument details.', 'danger');
      return;
    }

    const inst = res.data.instrument;
    const apps = res.data.applications || [];

    const appsHtml = apps.length > 0
      ? apps.map(a => `
          <tr>
            <td><strong>${a.application_number}</strong></td>
            <td>${getStatusBadge(a.status)}</td>
            <td>${formatDate(a.submitted_at)}</td>
            <td>${a.certificate_number ? `<span class="badge badge-success">${a.certificate_number}</span>` : '<span style="color:var(--text-muted);">None</span>'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No verification applications submitted for this device yet.</td></tr>';

    const modalHtml = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-info-circle-fill"></i> Instrument Specifications: ${inst.system_serial_number}</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:24px;">
              <div style="background:#F8FAFC; padding:12px; border-radius:6px; border:1px solid var(--border);">
                <small style="color:var(--text-muted);">System Serial Number</small>
                <div style="font-weight:700; font-family:monospace; color:var(--primary);">${inst.system_serial_number}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:6px; border:1px solid var(--border);">
                <small style="color:var(--text-muted);">Current Status</small>
                <div>${getStatusBadge(inst.status)}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:6px; border:1px solid var(--border);">
                <small style="color:var(--text-muted);">Capacity & Unit</small>
                <div style="font-weight:700;">${inst.capacity} ${inst.unit_of_measurement}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:6px; border:1px solid var(--border);">
                <small style="color:var(--text-muted);">Accuracy Class</small>
                <div style="font-weight:600;">${inst.accuracy_class}</div>
              </div>
            </div>

            <div class="table-responsive" style="margin-bottom:20px;">
              <table class="table" style="font-size:0.85rem;">
                <tbody>
                  <tr><th>Instrument Type</th><td>${inst.instrument_type}</td><th>Category</th><td>${inst.category}</td></tr>
                  <tr><th>Manufacturer</th><td>${inst.manufacturer}</td><th>Model Number</th><td>${inst.model_number}</td></tr>
                  <tr><th>Manufacturer Serial No</th><td>${inst.manufacturer_serial_number || 'N/A'}</td><th>Purchase Date</th><td>${formatDate(inst.purchase_date)}</td></tr>
                  <tr><th>Installation Location</th><td>${inst.installation_place}</td><th>Address</th><td>${inst.installation_address}</td></tr>
                </tbody>
              </table>
            </div>

            <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:10px; color:var(--primary);">
              <i class="bi bi-clock-history"></i> Verification Application History
            </h4>
            <div class="table-responsive">
              <table class="table" style="font-size:0.82rem;">
                <thead>
                  <tr><th>Application No</th><th>Status</th><th>Submitted On</th><th>Certificate</th></tr>
                </thead>
                <tbody>
                  ${appsHtml}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="App.closeModal()">Close</button>
            ${
              inst.status === 'registered' || inst.status === 'rejected' || inst.status === 'expired'
                ? `<button class="btn btn-primary" onclick="App.closeModal(); Applications.openNewWizard(${inst.id});">
                    <i class="bi bi-send-check"></i> Apply for Verification
                   </button>`
                : ''
            }
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  }
};
window.Instruments = Instruments;