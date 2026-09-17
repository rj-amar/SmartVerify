/**
 * Online Verification System - Officer Inspections & Digital Inspection Form Module
 * Conforming to Legal Metrology Standards
 */

const Inspections = {
  list: [],
  activeInspection: null,

  async loadInspections() {
    const container = document.getElementById('inspections-table-container');
    if (!container) return;

    // Shimmer skeleton loading
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>Application</th><th>Instrument</th><th>Applicant</th><th>Schedule</th><th>Location</th><th>Status</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody>
            ${Array(5).fill(0).map(() => `
              <tr class="skeleton-table-row">
                <td><div class="skeleton skeleton-text" style="width:120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:160px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:130px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:110px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:140px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:80px;"></div></td>
                <td style="text-align:right;"><div class="skeleton skeleton-text" style="width:100px; margin-left:auto;"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const res = await apiRequest('/inspections?limit=100');
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><i class="bi bi-exclamation-triangle"></i><h4>Unable to load inspections</h4><p>${res.data?.error || 'Failed to fetch inspections list.'}</p></div>`;
      return;
    }

    this.list = res.data.inspections || [];
    this.renderInspectionsTable();
  },

  renderInspectionsTable() {
    const container = document.getElementById('inspections-table-container');
    if (!container) return;

    if (this.list.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-clipboard-check"></i>
          <h4>No inspections scheduled</h4>
          <p>Scheduled physical verifications will appear here once allocated and confirmed.</p>
        </div>
      `;
      return;
    }

    const isOfficer = Auth.getRole() === 'officer';

    const rows = this.list.map(insp => `
      <tr>
        <td>
          <strong style="color:var(--navy-900); font-family:var(--font-mono); font-size:0.92rem;">
            ${insp.application_number}
          </strong>
        </td>
        <td>
          <div style="font-weight:700;">${insp.instrument_type}</div>
          <small style="color:var(--text-muted); font-family:var(--font-mono);">${insp.system_serial_number} (${insp.capacity} ${insp.unit_of_measurement})</small>
        </td>
        <td>
          <div>${insp.business_name || insp.applicant_name}</div>
          <small style="color:var(--text-muted);"><i class="bi bi-telephone"></i> ${insp.applicant_phone}</small>
        </td>
        <td>
          <div><i class="bi bi-calendar-event"></i> <strong>${formatDate(insp.scheduled_date)}</strong></div>
          <small style="color:var(--text-muted);"><i class="bi bi-clock"></i> ${insp.scheduled_time}</small>
        </td>
        <td>
          <div style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${insp.inspection_location}">
            <i class="bi bi-geo-alt"></i> ${insp.inspection_location}
          </div>
        </td>
        <td>${getStatusBadge(insp.status)}</td>
        <td style="text-align:right; white-space:nowrap;">
          ${
            isOfficer
              ? (() => {
                  const status = String(insp.status || '').trim().toLowerCase();
                  if (status === 'completed' || status === 'inspection_completed') {
                    return `<button class="btn btn-outline btn-sm" disabled aria-label="Inspection completed">
                              <i class="bi bi-check-circle-fill"></i> Completed
                            </button>`;
                  }
                  if (status === 'cancelled' || status === 'canceled') {
                    return `<button class="btn btn-outline btn-sm" disabled>
                              <i class="bi bi-x-circle-fill"></i> Cancelled
                            </button>`;
                  }
                  return `<button class="btn btn-secondary btn-sm" onclick="Inspections.openDigitalForm(${insp.id})">
                            <i class="bi bi-pencil-square"></i> Conduct Inspection
                          </button>`;
                })()
              : `<button class="btn btn-outline btn-sm" onclick="Applications.viewTrackingModal(${insp.application_id})">
                  <i class="bi bi-eye"></i> View Details
                 </button>`
          }
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Instrument</th>
              <th>Applicant</th>
              <th>Schedule</th>
              <th>Location</th>
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

  /**
   * Schedule Inspection Modal (Officer only)
   */
  openScheduleModal(applicationId) {
    const today = new Date().toISOString().split('T')[0];

    const modalHtml = `
      <div class="modal-backdrop" id="schedule-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-calendar-plus-fill" style="color:var(--primary-blue);"></i> Schedule Physical Verification</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form onsubmit="Inspections.handleScheduleSubmit(event, ${applicationId})">
            <div class="modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label>Inspection Date <span class="required">*</span></label>
                  <input type="date" id="sched-date" class="form-control" min="${today}" required />
                </div>
                <div class="form-group">
                  <label>Inspection Time <span class="required">*</span></label>
                  <input type="time" id="sched-time" class="form-control" value="10:00" required />
                </div>
              </div>

              <div class="form-group">
                <label>Physical Inspection Site Premises <span class="required">*</span></label>
                <input type="text" id="sched-location" class="form-control" placeholder="Precise site or shop premises address" required />
              </div>

              <div class="form-group">
                <label>Inspector Remarks / Standard Load Weights Required</label>
                <textarea id="sched-remarks" class="form-control" rows="3" placeholder="e.g. Bring standard M1 class weights 20kg x 5 for load test. Ensure weighing berth is clean."></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary" id="btn-sched-submit">
                <i class="bi bi-calendar-check-fill"></i> Confirm &amp; Notify Applicant
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleScheduleSubmit(e, applicationId) {
    e.preventDefault();
    const scheduled_date = document.getElementById('sched-date').value;
    const scheduled_time = document.getElementById('sched-time').value;
    const inspection_location = document.getElementById('sched-location').value.trim();
    const remarks = document.getElementById('sched-remarks').value.trim();
    const btn = document.getElementById('btn-sched-submit');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Scheduling...';

    const res = await apiRequest('/inspections', {
      method: 'POST',
      body: {
        application_id: applicationId,
        scheduled_date,
        scheduled_time,
        inspection_location,
        remarks
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-calendar-check-fill"></i> Confirm &amp; Notify Applicant';

    if (res.ok) {
      showToast('Inspection scheduled successfully! Applicant notified.', 'success');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      this.loadInspections();
    } else {
      showToast(res.data.error || 'Failed to schedule inspection.', 'danger');
    }
  },

  /**
   * Complete Digital Inspection Form
   */
  async openDigitalForm(inspectionId) {
    const res = await apiRequest(`/inspections/${inspectionId}`);
    if (!res.ok) {
      showToast(res.data.error || 'Failed to load inspection.', 'danger');
      return;
    }

    const insp = res.data.inspection;
    const photos = Array.isArray(res.data.photos)
      ? res.data.photos
      : (Array.isArray(insp.photos) ? insp.photos : []);
    this.activeInspection = { ...insp, photos };
    const unit = insp.unit_of_measurement || 'kg';
    const capacityNum = parseFloat(insp.capacity) || 100;

    let testPoints = insp.results && insp.results.length > 0
      ? insp.results
      : [
          { test_point: 'Zero Load Repeatability', standard_value: 0.0, observed_value: 0.0, permissible_error: 0.01, unit, result: 'pass', remarks: 'Zero return test' },
          { test_point: '25% Nominal Capacity Load Test', standard_value: (capacityNum * 0.25).toFixed(2), observed_value: (capacityNum * 0.25).toFixed(2), permissible_error: 0.02, unit, result: 'pass', remarks: 'Quarter load linearity' },
          { test_point: '50% Nominal Capacity Load Test', standard_value: (capacityNum * 0.5).toFixed(2), observed_value: (capacityNum * 0.5).toFixed(2), permissible_error: 0.05, unit, result: 'pass', remarks: 'Half capacity load' },
          { test_point: '100% Maximum Capacity Load Test', standard_value: capacityNum.toFixed(2), observed_value: capacityNum.toFixed(2), permissible_error: 0.1, unit, result: 'pass', remarks: 'Full scale maximum load' }
        ];

    this.activeInspection.currentTestPoints = testPoints;
    this.renderDigitalFormModal();
  },

  renderDigitalFormModal() {
    const insp = this.activeInspection;
    const unit = insp.unit_of_measurement || 'kg';
    const points = insp.currentTestPoints;
    const photos = insp.photos || [];

    const rowsHtml = points.map((p, idx) => {
      const std = parseFloat(p.standard_value) || 0;
      const obs = parseFloat(p.observed_value) || 0;
      const perm = parseFloat(p.permissible_error) || 0;
      const errVal = (obs - std).toFixed(4);
      const errPct = std !== 0 ? (((obs - std) / std) * 100).toFixed(2) : '0.00';
      const isPass = Math.abs(obs - std) <= (perm + 0.000001);

      return `
        <tr id="tp-row-${idx}">
          <td>
            <input type="text" class="form-control form-control-sm" value="${escapeHtml(p.test_point)}" onchange="Inspections.updateTestPoint(${idx}, 'test_point', this.value)" />
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.standard_value}" oninput="Inspections.calcTestPoint(${idx}, 'standard_value', this.value)" />
              <small style="color:var(--text-muted); font-weight:700;">${unit}</small>
            </div>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.observed_value}" oninput="Inspections.calcTestPoint(${idx}, 'observed_value', this.value)" />
              <small style="color:var(--text-muted); font-weight:700;">${unit}</small>
            </div>
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" step="any" class="form-control form-control-sm" value="${p.permissible_error}" oninput="Inspections.calcTestPoint(${idx}, 'permissible_error', this.value)" />
              <small style="color:var(--text-muted); font-weight:700;">${unit}</small>
            </div>
          </td>
          <td style="font-family:var(--font-mono); font-size:0.84rem; font-weight:700;" id="tp-err-${idx}">
            ${errVal} ${unit} (${errPct}%)
          </td>
          <td id="tp-res-${idx}">
            <span class="badge ${isPass ? 'badge-success' : 'badge-danger'}">${isPass ? 'PASS' : 'FAIL'}</span>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm" value="${escapeHtml(p.remarks || '')}" placeholder="Remarks" onchange="Inspections.updateTestPoint(${idx}, 'remarks', this.value)" />
          </td>
          <td style="text-align:right;">
            <button type="button" class="btn btn-danger btn-sm" onclick="Inspections.removeTestPoint(${idx})" title="Remove test point">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    const photosHtml = photos.length > 0
      ? `<div class="table-responsive" style="border:1px solid var(--border-subtle); border-radius:var(--radius-xs);">
          <table class="table" style="font-size:0.82rem; margin:0;">
            <thead>
              <tr>
                <th>Photograph</th>
                <th>Caption</th>
                <th>Uploaded</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${photos.map((ph, index) => {
                const filename = ph.stored_filename || ph.filename || '';
                const caption = ph.caption || ph.original_filename || `Inspection photo ${index + 1}`;
                const uploaded = ph.uploaded_at ? formatDateTime(ph.uploaded_at) : '—';
                const safeFilename = String(filename).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<tr>
                  <td><strong>${escapeHtml(ph.original_filename || ph.filename || `Photo ${index + 1}`)}</strong></td>
                  <td>${escapeHtml(caption)}</td>
                  <td>${uploaded}</td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button type="button" class="btn btn-outline btn-sm"
                      onclick="Applications.viewInspectionPhoto('${safeFilename}')"
                      title="Open photograph in new tab">
                      <i class="bi bi-eye"></i> View
                    </button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`
      : '<div style="color:var(--text-muted); font-size:0.82rem; font-style:italic;">No photographs uploaded yet.</div>';

    const modalHtml = `
      <div class="modal-backdrop" id="digital-insp-modal">
        <div class="modal-dialog modal-dialog-lg" style="max-width:980px;">
          <div class="modal-header">
            <h3><i class="bi bi-clipboard2-pulse-fill" style="color:var(--primary-blue);"></i> Digital Field Inspection Form</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <!-- Specification Band -->
            <div style="background:var(--navy-900); color:#FFFFFF; padding:16px 20px; border-radius:var(--radius-sm); display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:20px; font-size:0.84rem;">
              <div><span style="color:#94A3B8;">Instrument:</span><br><strong>${insp.instrument_type}</strong></div>
              <div><span style="color:#94A3B8;">Serial Number:</span><br><strong style="font-family:var(--font-mono); color:#FDE68A;">${insp.system_serial_number}</strong></div>
              <div><span style="color:#94A3B8;">Capacity &amp; Unit:</span><br><strong>${insp.capacity} ${unit}</strong></div>
              <div><span style="color:#94A3B8;">Accuracy Class:</span><br><strong>${insp.accuracy_class}</strong></div>
              <div><span style="color:#94A3B8;">Manufacturer / Model:</span><br><strong>${insp.manufacturer} (${insp.model_number})</strong></div>
              <div><span style="color:#94A3B8;">Applicant / Business:</span><br><strong>${insp.business_name || insp.applicant_name}</strong></div>
            </div>

            <!-- Dynamic Test Points Grid -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h4 style="font-size:0.95rem; font-weight:800; color:var(--navy-900); margin:0;">
                <i class="bi bi-speedometer2" style="color:var(--primary-blue);"></i> Statutory Test Point Measurements (${unit})
              </h4>
              <button type="button" class="btn btn-outline btn-sm" onclick="Inspections.addTestPoint()">
                <i class="bi bi-plus-lg"></i> Add Test Point
              </button>
            </div>

            <div class="table-responsive" style="margin-bottom:20px; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
              <table class="table inspection-test-table" style="font-size:0.82rem; margin:0;">
                <thead>
                  <tr>
                    <th style="width:24%;">Test Point</th>
                    <th style="width:16%;">Standard Value</th>
                    <th style="width:16%;">Observed Value</th>
                    <th style="width:15%;">Permissible Error</th>
                    <th style="width:14%;">Calculated Error</th>
                    <th style="width:8%;">Result</th>
                    <th style="width:14%;">Remarks</th>
                    <th style="width:3%;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- Photographs Section -->
            <div style="border-top:1px solid var(--border-color); padding-top:18px; margin-bottom:18px;">
              <h4 style="font-size:0.92rem; font-weight:800; color:var(--navy-900); margin-bottom:10px;">
                <i class="bi bi-camera-fill" style="color:var(--primary-blue);"></i> Inspection Photographic Evidence (Max 10 Images, Max 5MB Each)
              </h4>

              <div class="form-row" style="margin-bottom:12px; align-items:center;">
                <div class="form-group" style="flex:1; margin:0;">
                  <input type="file" id="insp-photo-input" class="form-control form-control-sm" accept=".jpg,.jpeg,.png,.webp" multiple />
                </div>
                <div class="form-group" style="flex:1; margin:0;">
                  <input type="text" id="insp-photo-caption" class="form-control form-control-sm" placeholder="Optional Photo Caption (e.g. Seal Condition, Indicator Plate)" />
                </div>
                <div>
                  <button type="button" class="btn btn-outline btn-sm" id="btn-upload-photo" onclick="Inspections.uploadPhotos(${insp.id})">
                    <i class="bi bi-cloud-arrow-up"></i> Upload Photos
                  </button>
                </div>
              </div>

              <div class="photo-preview-grid">
                ${photosHtml}
              </div>
            </div>

            <!-- General Inspector Remarks -->
            <div class="form-group" style="border-top:1px solid var(--border-color); padding-top:16px;">
              <label>Field Verification Summary &amp; Stamp Remarks</label>
              <textarea id="insp-overall-remarks" class="form-control" rows="2" placeholder="Overall summary of physical condition, seal integrity, lead stamp application, and tolerance conformance.">${escapeHtml(insp.remarks || '')}</textarea>
            </div>
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <div>
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Close Form</button>
            </div>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn btn-outline" id="btn-save-measurements" onclick="Inspections.saveTestPoints(${insp.id})">
                <i class="bi bi-save"></i> Save Results
              </button>
              <button type="button" class="btn btn-success" id="btn-complete-insp" onclick="Inspections.completeInspection(${insp.id})">
                <i class="bi bi-check-all"></i> Complete Inspection
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async loadProtectedPhotoPreviews(photos) {
    const token = Storage.getToken();
    if (!token || !photos.length) return;

    for (const photo of photos) {
      const img = document.querySelector(`img[data-photo-filename="${CSS.escape(photo.stored_filename)}"]`);
      if (!img) continue;
      try {
        const response = await fetch(`${CONFIG.API_BASE}/inspections/photo/${encodeURIComponent(photo.stored_filename)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Photo unavailable');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        img.src = url;
        img.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
      } catch (err) {
        img.alt = 'Photo unavailable';
        img.style.opacity = '0.45';
      }
    }
  },

  calcTestPoint(idx, field, val) {
    const p = this.activeInspection.currentTestPoints[idx];
    p[field] = parseFloat(val) || 0;

    const std = parseFloat(p.standard_value) || 0;
    const obs = parseFloat(p.observed_value) || 0;
    const perm = parseFloat(p.permissible_error) || 0;
    const unit = this.activeInspection.unit_of_measurement || 'kg';

    const errVal = (obs - std).toFixed(4);
    const errPct = std !== 0 ? (((obs - std) / std) * 100).toFixed(2) : '0.00';
    const isPass = Math.abs(obs - std) <= (perm + 0.000001);
    p.result = isPass ? 'pass' : 'fail';

    const errEl = document.getElementById(`tp-err-${idx}`);
    const resEl = document.getElementById(`tp-res-${idx}`);
    if (errEl) errEl.innerText = `${errVal} ${unit} (${errPct}%)`;
    if (resEl) {
      resEl.innerHTML = `<span class="badge ${isPass ? 'badge-success' : 'badge-danger'}">${isPass ? 'PASS' : 'FAIL'}</span>`;
    }
  },

  updateTestPoint(idx, field, val) {
    this.activeInspection.currentTestPoints[idx][field] = val;
  },

  addTestPoint() {
    const unit = this.activeInspection.unit_of_measurement || 'kg';
    this.activeInspection.currentTestPoints.push({
      test_point: 'New Load Point',
      standard_value: 0,
      observed_value: 0,
      permissible_error: 0.05,
      unit,
      result: 'pass',
      remarks: ''
    });
    this.renderDigitalFormModal();
  },

  removeTestPoint(idx) {
    this.activeInspection.currentTestPoints.splice(idx, 1);
    this.renderDigitalFormModal();
  },

  async saveTestPoints(inspectionId) {
    const btn = document.getElementById('btn-save-measurements');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Saving...';
    }

    const res = await apiRequest(`/inspections/${inspectionId}/results`, {
      method: 'POST',
      body: {
        test_points: this.activeInspection.currentTestPoints
      }
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-save"></i> Save Results';
    }

    if (res.ok) {
      showToast('Measurements saved successfully.', 'success');
    } else {
      showToast(res.data.error || 'Failed to save measurements.', 'danger');
    }
  },

  async uploadPhotos(inspectionId) {
    const fileInput = document.getElementById('insp-photo-input');
    const caption = document.getElementById('insp-photo-caption').value.trim();
    const btn = document.getElementById('btn-upload-photo');

    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Please select photos to upload.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('caption', caption);
    for (const file of fileInput.files) {
      formData.append('photos', file);
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Uploading...';
    }

    const res = await apiRequest(`/inspections/${inspectionId}/photos`, {
      method: 'POST',
      body: formData
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Upload Photos';
    }

    if (res.ok) {
      showToast('Inspection photos uploaded successfully.', 'success');
      this.openDigitalForm(inspectionId);
    } else {
      showToast(res.data.error || 'Failed to upload photos.', 'danger');
    }
  },

  async completeInspection(inspectionId) {
    await this.saveTestPoints(inspectionId);

    const remarks = document.getElementById('insp-overall-remarks').value.trim();
    const btn = document.getElementById('btn-complete-insp');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Completing...';
    }

    const res = await apiRequest(`/inspections/${inspectionId}/complete`, {
      method: 'POST',
      body: { remarks }
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-all"></i> Complete Inspection';
    }

    if (res.ok) {
      showToast('Digital inspection completed! You may now approve or reject the application.', 'success');
      App.closeModal();
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
      this.loadInspections();
      Certificates.openApprovalModal(this.activeInspection.application_id);
    } else {
      showToast(res.data.error || 'Failed to complete inspection.', 'danger');
    }
  }
};

window.Inspections = Inspections;