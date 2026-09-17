/**
 * Online Verification System - Admin Management Module
 * Central Directorate for Legal Metrology
 */

const Admin = {
  summary: null,
  users: [],
  districts: [],

  async loadDashboard() {
    const statsContainer = document.getElementById('admin-stats-container');
    if (!statsContainer) return;

    // Shimmer skeleton
    statsContainer.innerHTML = `
      <div class="stats-grid">
        ${Array(6).fill(0).map(() => `
          <div class="stat-card">
            <div class="skeleton" style="width:50px; height:50px; border-radius:10px;"></div>
            <div style="flex:1;">
              <div class="skeleton skeleton-title" style="width:40px; margin-bottom:6px;"></div>
              <div class="skeleton skeleton-text" style="width:110px;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    const res = await apiRequest('/admin/summary');
    if (!res.ok) {
      statsContainer.innerHTML = `<div class="empty-state text-danger"><p>${res.data?.error || 'Failed to load directorate metrics.'}</p></div>`;
      return;
    }

    this.summary = res.data.summary;
    const s = this.summary;

    statsContainer.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon primary"><i class="bi bi-people-fill"></i></div>
          <div class="stat-details">
            <h3>${s.total_users}</h3>
            <p>Total Registered Users (${s.total_owners} Owners, ${s.total_officers} Officers)</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i class="bi bi-scale"></i></div>
          <div class="stat-details">
            <h3>${s.total_instruments}</h3>
            <p>Total Registered Instruments</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon warning"><i class="bi bi-hourglass-split"></i></div>
          <div class="stat-details">
            <h3>${s.pending_applications}</h3>
            <p>Pending Verification Applications</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon success"><i class="bi bi-patch-check-fill"></i></div>
          <div class="stat-details">
            <h3>${s.verified_applications}</h3>
            <p>Verified &amp; Certified Applications</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon primary"><i class="bi bi-award-fill"></i></div>
          <div class="stat-details">
            <h3>${s.total_certificates}</h3>
            <p>Total Digital Certificates (${s.active_certificates} Active)</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon danger"><i class="bi bi-x-circle-fill"></i></div>
          <div class="stat-details">
            <h3>${s.rejected_applications}</h3>
            <p>Rejected Applications</p>
          </div>
        </div>
      </div>
    `;

    // Render Recent Audit Logs
    const logsContainer = document.getElementById('admin-recent-logs-container');
    if (logsContainer && res.data.recent_activity) {
      const logs = res.data.recent_activity;
      logsContainer.innerHTML = logs.length > 0
        ? `
          <div class="table-responsive">
            <table class="table" style="font-size:0.84rem;">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor / User</th>
                  <th>Timestamp</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr>
                    <td><strong style="color:var(--navy-900);">${l.action}</strong></td>
                    <td><span class="badge badge-secondary">${l.entity_type}</span></td>
                    <td>${l.user_name || 'System'} <small style="color:var(--text-muted);">(${l.user_role || 'system'})</small></td>
                    <td>${formatDateTime(l.created_at)}</td>
                    <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${l.details || ''}">
                      ${l.details || 'N/A'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `
        : '<div class="empty-state">No recent activity logs recorded yet.</div>';
    }
  },

  async loadUsers(roleFilter = '', search = '') {
    const container = document.getElementById('admin-users-table-container');
    if (!container) return;

    // Shimmer skeleton loading
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>User Name &amp; Email</th><th>Enterprise / Phone</th><th>Role</th><th>Assigned District</th><th>Status</th><th>Registered</th><th style="text-align:right;">Actions</th></tr>
          </thead>
          <tbody>
            ${Array(5).fill(0).map(() => `
              <tr class="skeleton-table-row">
                <td><div class="skeleton skeleton-text" style="width:130px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:140px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:80px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:70px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:90px;"></div></td>
                <td style="text-align:right;"><div class="skeleton skeleton-text" style="width:100px; margin-left:auto;"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    let url = '/admin/users?limit=100';
    if (roleFilter) url += `&role=${roleFilter}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const res = await apiRequest(url);
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><p>${res.data?.error || 'Failed to load users.'}</p></div>`;
      return;
    }

    this.users = res.data.users || [];
    this.renderUsersTable();
  },

  renderUsersTable() {
    const container = document.getElementById('admin-users-table-container');
    if (!container) return;

    if (this.users.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-people"></i><h4>No users found</h4></div>';
      return;
    }

    const rows = this.users.map(u => `
      <tr>
        <td>
          <div style="font-weight:700; color:var(--navy-900);">${u.full_name}</div>
          <small style="color:var(--text-muted);">${u.email}</small>
        </td>
        <td>
          <div>${u.business_name || 'N/A'}</div>
          <small style="color:var(--text-muted);"><i class="bi bi-telephone"></i> ${u.phone}</small>
        </td>
        <td>
          <span class="badge ${u.role === 'admin' ? 'badge-primary' : (u.role === 'officer' ? 'badge-warning' : 'badge-secondary')}">
            ${u.role}
          </span>
        </td>
        <td>
          <strong>${u.district}</strong>
          <div><small style="color:var(--text-muted);">${u.state}</small></div>
        </td>
        <td>
          <span class="badge ${u.is_active ? 'badge-success' : 'badge-danger'}">
            ${u.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </td>
        <td><small>${formatDate(u.created_at)}</small></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-outline btn-sm" onclick="Admin.toggleUserActive(${u.id}, ${!u.is_active})">
            ${u.is_active ? '<i class="bi bi-slash-circle"></i> Deactivate' : '<i class="bi bi-check-circle"></i> Activate'}
          </button>
          ${
            u.role === 'officer'
              ? `<button class="btn btn-secondary btn-sm" style="margin-left:4px;" onclick="Admin.openEditOfficerModal(${u.id})">
                  <i class="bi bi-pencil"></i> District
                 </button>`
              : ''
          }
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>User Name &amp; Email</th>
              <th>Enterprise / Phone</th>
              <th>Role</th>
              <th>Assigned District</th>
              <th>Status</th>
              <th>Registered</th>
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

  openCreateOfficerModal() {
    const statesOptions = CONFIG.INDIAN_STATES.map(s => `<option value="${s}">${s}</option>`).join('');

    const modalHtml = `
      <div class="modal-backdrop" id="create-officer-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-person-plus-fill" style="color:var(--primary-blue);"></i> Create Legal Metrology Officer Account</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form onsubmit="Admin.handleCreateOfficer(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>Officer Full Name <span class="required">*</span></label>
                <input type="text" id="off-name" class="form-control" placeholder="e.g. Inspector Rajesh Kumar" required />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Official Email Address <span class="required">*</span></label>
                  <input type="email" id="off-email" class="form-control" placeholder="officer@metrology.gov.in" required />
                </div>
                <div class="form-group">
                  <label>Mobile Number <span class="required">*</span></label>
                  <input type="tel" id="off-phone" class="form-control" placeholder="10-digit number" pattern="[6-9][0-9]{9}" required />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Assigned State <span class="required">*</span></label>
                  <select id="off-state" class="form-control" required>
                    <option value="">-- Select State --</option>
                    ${statesOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>Assigned District <span class="required">*</span></label>
                  <input type="text" id="off-district" class="form-control" placeholder="District name (e.g. Purnea)" required />
                  <div class="form-hint">Used for automatic jurisdictional assignment</div>
                </div>
              </div>
              <div class="form-group">
                <label>Default Password <span class="required">*</span></label>
                <input type="password" id="off-password" class="form-control" placeholder="Minimum 6 characters" minlength="6" required />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary" id="btn-create-off">
                <i class="bi bi-person-check-fill"></i> Create Officer
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleCreateOfficer(e) {
    e.preventDefault();
    const full_name = document.getElementById('off-name').value.trim();
    const email = document.getElementById('off-email').value.trim();
    const phone = document.getElementById('off-phone').value.trim();
    const state = document.getElementById('off-state').value;
    const district = document.getElementById('off-district').value.trim();
    const password = document.getElementById('off-password').value;
    const btn = document.getElementById('btn-create-off');

    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Creating...';

    const res = await apiRequest('/admin/users', {
      method: 'POST',
      body: {
        full_name,
        email,
        phone,
        role: 'officer',
        state,
        district,
        password
      }
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-person-check-fill"></i> Create Officer';

    if (res.ok) {
      showToast(`Officer account for ${full_name} created successfully!`, 'success');
      App.closeModal();
      this.loadUsers('officer');
      this.loadDashboard();
    } else {
      showToast(res.data.error || 'Failed to create officer.', 'danger');
    }
  },

  async toggleUserActive(userId, newState) {
    const res = await apiRequest(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: { is_active: newState }
    });

    if (res.ok) {
      showToast(`User ${newState ? 'activated' : 'deactivated'} successfully.`, 'info');
      this.loadUsers();
      this.loadDashboard();
    } else {
      showToast(res.data.error || 'Failed to update user status.', 'danger');
    }
  },

  openEditOfficerModal(officerId) {
    const officer = this.users.find(u => u.id === officerId);
    if (!officer) return;

    const modalHtml = `
      <div class="modal-backdrop" id="edit-officer-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-pencil-square" style="color:var(--primary-blue);"></i> Reassign District: ${officer.full_name}</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form onsubmit="Admin.handleReassignDistrict(event, ${officerId})">
            <div class="modal-body">
              <div class="form-group">
                <label>Assigned District <span class="required">*</span></label>
                <input type="text" id="edit-off-district" class="form-control" value="${escapeHtml(officer.district)}" required />
                <div class="form-hint">District matching is case-insensitive (e.g. "Purnea")</div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary">Update District</button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleReassignDistrict(e, officerId) {
    e.preventDefault();
    const district = document.getElementById('edit-off-district').value.trim();
    const res = await apiRequest(`/admin/users/${officerId}`, {
      method: 'PATCH',
      body: { district }
    });

    if (res.ok) {
      showToast('Officer district updated successfully.', 'success');
      App.closeModal();
      this.loadUsers('officer');
    } else {
      showToast(res.data.error || 'Failed to update district.', 'danger');
    }
  },

  async loadDistricts() {
    const container = document.getElementById('admin-districts-table-container');
    if (!container) return;

    // Shimmer skeleton
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr><th>District Name</th><th>State</th><th>Assigned Officers</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${Array(5).fill(0).map(() => `
              <tr class="skeleton-table-row">
                <td><div class="skeleton skeleton-text" style="width:120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:120px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:100px;"></div></td>
                <td><div class="skeleton skeleton-text" style="width:70px;"></div></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const res = await apiRequest('/admin/districts');
    if (!res.ok) {
      container.innerHTML = `<div class="empty-state text-danger"><p>${res.data?.error || 'Failed to load districts.'}</p></div>`;
      return;
    }

    this.districts = res.data.districts || [];
    const rows = this.districts.map(d => `
      <tr>
        <td><strong>${d.district_name}</strong></td>
        <td>${d.state_name}</td>
        <td>
          <span class="badge ${d.officer_count > 0 ? 'badge-success' : 'badge-warning'}">
            ${d.officer_count} Active Officer(s)
          </span>
        </td>
        <td>
          <span class="badge ${d.is_active ? 'badge-success' : 'badge-danger'}">
            ${d.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>District Name</th>
              <th>State</th>
              <th>Assigned Officers</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  },

  openAddDistrictModal() {
    const statesOptions = CONFIG.INDIAN_STATES.map(s => `<option value="${s}">${s}</option>`).join('');

    const modalHtml = `
      <div class="modal-backdrop" id="add-district-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3><i class="bi bi-geo-alt-fill" style="color:var(--primary-blue);"></i> Add Master Metrology District</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form onsubmit="Admin.handleAddDistrict(event)">
            <div class="modal-body">
              <div class="form-group">
                <label>State <span class="required">*</span></label>
                <select id="dist-state" class="form-control" required>
                  <option value="">-- Select State --</option>
                  ${statesOptions}
                </select>
              </div>
              <div class="form-group">
                <label>District Name <span class="required">*</span></label>
                <input type="text" id="dist-name" class="form-control" placeholder="e.g. Darbhanga" required />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary">Add District</button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleAddDistrict(e) {
    e.preventDefault();
    const state_name = document.getElementById('dist-state').value;
    const district_name = document.getElementById('dist-name').value.trim();

    const res = await apiRequest('/admin/districts', {
      method: 'POST',
      body: { state_name, district_name }
    });

    if (res.ok) {
      showToast(`District ${district_name} added successfully!`, 'success');
      App.closeModal();
      this.loadDistricts();
      this.loadDashboard();
    } else {
      showToast(res.data.error || 'Failed to add district.', 'danger');
    }
  }
};

window.Admin = Admin;