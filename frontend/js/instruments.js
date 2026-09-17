/**
 * Online Verification System - Instruments Management Module
 * Conforming to Legal Metrology Standards
 */

const Instruments = {
  list: [],

  handleFilterChange() {
    const search = document.getElementById('filter-inst-search')?.value || '';
    this.loadInstruments(search);
  },

  async loadInstruments(search = '') {
    const container = document.getElementById('instruments-table-container');
    if (!container) return;

    const statusFilter = document.getElementById('filter-inst-status')?.value || '';

    // Shimmer skeleton
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>System Serial No.</th><th>Type &amp; Category</th><th>Manufacturer &amp; Model</th><th>Capacity &amp; Class</th><th>Installation &amp; Purchase</th><th>Status</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody>
            ${Array(5).fill(0).map(() => `
              <tr class="skeleton-table-row">
                <td><div class="skeleton skeleton-text" style="width:110px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:160px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:140px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:90px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:80px;"></div></td>
                <td style="text-align:right;"><div class="skeleton skeleton-text" style="width:100px; margin-left:auto;"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    let url = '/instruments?limit=100';
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

    const res = await apiRequest(url);
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><i class="bi bi-exclamation-triangle"></i><h4>Unable to load instruments</h4><p>${res.data?.error || 'Failed to fetch registered equipment.'}</p></div>`;
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
          <h4>No instruments found</h4>
          <p>No weighing or measuring devices match your current filters. Register your equipment to initiate the statutory verification process.</p>
          ${
            Auth.getRole() === 'owner'
              ? `<button class="btn btn-secondary btn-sm" style="margin-top: 14px;" onclick="Instruments.openRegisterModal()">
                   <i class="bi bi-plus-circle"></i> Register New Instrument
                 </button>`
              : ''
          }
        </div>
      `;
      return;
    }

    const rows = this.list.map(inst => `
      <tr>
        <td>
          <strong style="color:var(--navy-900); font-family:var(--font-mono); font-size:0.92rem;">
            ${inst.system_serial_number}
          </strong>
        </td>
        <td>
          <div style="font-weight:700;">${inst.instrument_type}</div>
          <small style="color:var(--text-muted);">${inst.category}</small>
        </td>
        <td>
          <div>${inst.manufacturer}</div>
          <small style="color:var(--text-muted);">Model: ${inst.model_number}</small>
        </td>
        <td>
          <strong>${inst.capacity} ${inst.unit_of_measurement}</strong>
          <div><small class="badge badge-secondary" style="margin-top:2px;">${inst.accuracy_class}</small></div>
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
          ${this.renderLifecycleActions(inst)}
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>System Serial No.</th>
              <th>Type &amp; Category</th>
              <th>Manufacturer &amp; Model</th>
              <th>Capacity &amp; Class</th>
              <th>Installation &amp; Purchase</th>
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
        <button class="btn btn-outline btn-sm" onclick="Certificates.openRenewModal(${inst.latest_certificate_id})" style="margin-left:4px;">
          <i class="bi bi-arrow-repeat"></i> ${certExpiring ? 'Renew Soon' : 'Renew'}
        </button>
        <button class="btn btn-primary btn-sm" onclick="Instruments.startReverification(${inst.id})" style="margin-left:4px;">
          <i class="bi bi-shield-check"></i> Re-verify
        </button>`;
    }

    if (status === 'registered' || status === 'rejected' || status === 'expired') {
      return `
        <button class="btn btn-secondary btn-sm" onclick="Applications.openNewWizard(${inst.id}, '${status === 'expired' ? 'renewal' : 'initial'}')" style="margin-left:4px;">
          <i class="bi bi-send-check"></i> ${status === 'expired' ? 'Renew Verification' : 'Apply'}
        </button>`;
    }

    if (status === 'pending_verification') {
      return `<span class="badge badge-info" style="margin-left:4px;"><i class="bi bi-hourglass-split"></i> In Progress</span>`;
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
            <h3><i class="bi bi-plus-square-dotted" style="color:var(--primary-blue);"></i> Register Commercial Instrument</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form id="inst-form" onsubmit="Instruments.handleRegister(event)">
            <div class="modal-body">
              <div class="alert alert-info" style="background:#EFF6FF; border:1px solid #BFDBFE; padding:12px 16px; border-radius:var(--radius-sm); font-size:0.84rem; margin-bottom:18px; color:#1E40AF; display:flex; align-items:center; gap:10px;">
                <i class="bi bi-info-circle-fill" style="font-size:1.1rem; flex-shrink:0;"></i>
                <div>
                  <strong>Statutory Identification:</strong> The permanent System Serial Number (e.g. <code>OVS-000001</code>) is automatically generated by the database upon submission.
                </div>
              </div>

              <!-- Section 1: Classification -->
              <div class="form-section-title"><i class="bi bi-tag"></i> 1. Instrument Classification</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Instrument Category <span class="required">*</span></label>
                  <select id="inst-category" class="form-control" required>
                    <option value="">-- Select Category --</option>
                    ${categoryOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>Instrument Description / Type <span class="required">*</span></label>
                  <input type="text" id="inst-type" class="form-control" placeholder="e.g. Electronic Counter Scale" required />
                </div>
              </div>

              <!-- Section 2: Technical Specifications -->
              <div class="form-section-title"><i class="bi bi-cpu"></i> 2. Technical &amp; Metrological Specifications</div>
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
                  <label>Manufacturer Physical Serial No.</label>
                  <input type="text" id="inst-mfg-serial" class="form-control" placeholder="Physical plate serial number" />
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
                </div>
                <div class="form-group">
                  <label>Purchase Date <span class="required">*</span></label>
                  <input type="date" id="inst-purchase-date" class="form-control" required />
                </div>
              </div>

              <!-- Section 3: Installation Location -->
              <div class="form-section-title"><i class="bi bi-geo-alt"></i> 3. Premises Installation Site</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Place of Installation (Premises) <span class="required">*</span></label>
                  <input type="text" id="inst-place" class="form-control" placeholder="e.g. Main Retail Counter / Warehouse Bay 2" required />
                </div>
                <div class="form-group">
                  <label>Installation Address <span class="required">*</span></label>
                  <input type="text" id="inst-address" class="form-control" placeholder="Exact postal address where instrument is operated" required />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary" id="btn-inst-submit">
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
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Generating Serial &amp; Registering...';

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

      const successModalHtml = `
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header" style="background:#ECFDF5; border-bottom:1px solid #A7F3D0;">
              <h3 style="color:#065F46;"><i class="bi bi-check-circle-fill"></i> Instrument Registered Successfully</h3>
            </div>
            <div class="modal-body" style="text-align:center; padding: 28px 20px;">
              <div style="font-size:3.2rem; color:#059669; margin-bottom:10px;">
                <i class="bi bi-patch-check-fill"></i>
              </div>
              <h4 style="font-size:1.2rem; font-weight:800; color:var(--navy-900);">Statutory Record Created</h4>
              <p style="color:var(--text-muted); margin-top:4px; font-size:0.88rem;">Your device has been recorded in the Legal Metrology Registry.</p>
              
              <div style="background:#F8FAFC; border:2px dashed #0066FF; padding:18px; border-radius:var(--radius-md); margin:20px 0;">
                <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); font-weight:700;">Official System Serial Number</div>
                <div style="font-size:2rem; font-weight:800; color:var(--navy-900); font-family:var(--font-mono); margin-top:4px;">
                  ${serial}
                </div>
              </div>

              <p style="font-size:0.84rem; color:var(--text-secondary);">
                Submit a verification application to schedule statutory inspection and receive your official digital certificate.
              </p>
            </div>
            <div class="modal-footer" style="justify-content:center; gap:12px;">
              <button type="button" class="btn btn-outline" onclick="App.closeModal(); Instruments.loadInstruments();">
                View Instruments
              </button>
              <button type="button" class="btn btn-secondary" onclick="App.closeModal(); Applications.openNewWizard(${res.data.instrument.id});">
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
            <td><strong style="font-family:var(--font-mono);">${a.application_number}</strong></td>
            <td>${getStatusBadge(a.status)}</td>
            <td>${formatDate(a.submitted_at)}</td>
            <td>${a.certificate_number ? `<span class="badge badge-success" style="font-family:var(--font-mono);">${a.certificate_number}</span>` : '<span style="color:var(--text-muted);">None</span>'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:16px;">No verification applications submitted for this device yet.</td></tr>';

    const modalHtml = `
      <div class="modal-backdrop" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-info-circle-fill" style="color:var(--primary-blue);"></i> Specifications: ${inst.system_serial_number}</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:20px;">
              <div style="background:#F8FAFC; padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                <small style="color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; font-weight:700;">System Serial Number</small>
                <div style="font-weight:800; font-family:var(--font-mono); color:var(--navy-900); font-size:1.05rem;">${inst.system_serial_number}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                <small style="color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; font-weight:700;">Statutory Status</small>
                <div>${getStatusBadge(inst.status)}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                <small style="color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; font-weight:700;">Capacity &amp; Unit</small>
                <div style="font-weight:700;">${inst.capacity} ${inst.unit_of_measurement}</div>
              </div>
              <div style="background:#F8FAFC; padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                <small style="color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; font-weight:700;">Accuracy Class</small>
                <div style="font-weight:600;"><span class="badge badge-secondary">${inst.accuracy_class}</span></div>
              </div>
            </div>

            <div class="table-responsive" style="margin-bottom:20px; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
              <table class="table" style="font-size:0.85rem; margin:0;">
                <tbody>
                  <tr><th style="width:25%;">Instrument Type</th><td><strong>${inst.instrument_type}</strong></td><th style="width:25%;">Category</th><td>${inst.category}</td></tr>
                  <tr><th>Manufacturer</th><td>${inst.manufacturer}</td><th>Model Number</th><td>${inst.model_number}</td></tr>
                  <tr><th>Manufacturer Serial</th><td>${inst.manufacturer_serial_number || 'N/A'}</td><th>Purchase Date</th><td>${formatDate(inst.purchase_date)}</td></tr>
                  <tr><th>Installation Location</th><td>${inst.installation_place}</td><th>Site Address</th><td>${inst.installation_address}</td></tr>
                </tbody>
              </table>
            </div>

            <h4 style="font-size:0.95rem; font-weight:800; margin-bottom:10px; color:var(--navy-900); display:flex; align-items:center; gap:8px;">
              <i class="bi bi-clock-history" style="color:var(--primary-blue);"></i> Verification Application History
            </h4>
            <div class="table-responsive" style="border:1px solid var(--border-color); border-radius:var(--radius-sm);">
              <table class="table" style="font-size:0.82rem; margin:0;">
                <thead>
                  <tr><th>Application Ref</th><th>Status</th><th>Submitted On</th><th>Certificate</th></tr>
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
                ? `<button class="btn btn-secondary" onclick="App.closeModal(); Applications.openNewWizard(${inst.id});">
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