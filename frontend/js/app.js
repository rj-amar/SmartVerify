/**
 * Online Verification System - Main Application Orchestrator & Router
 */

const App = {
  currentView: 'home',

  async init() {
    Auth.init();

    // Apply the public-site theme immediately so the homepage never renders
    // as a blank/internal white canvas during session verification.
    const initialRoute = (window.location.hash.replace('#', '') || 'home').split('?')[0];
    const initialIsPublic = ['home', 'public-verify', 'complaint'].includes(initialRoute) ||
      initialRoute === 'home#how-it-works' ||
      initialRoute === 'home#services';
    document.body.classList.toggle('public-mode', initialIsPublic);

    await Auth.verifySession();
    this.renderAuthUI();

    // Setup hash change router
    window.addEventListener('hashchange', () => this.routeByHash());
    this.routeByHash();

    // Start periodic unread notification badge polling every 45 seconds
    if (Auth.isLoggedIn()) {
      Notifications.fetchUnreadCount();
      setInterval(() => Notifications.fetchUnreadCount(), 45000);
    }
  },

  routeByHash() {
    const rawHash = window.location.hash.replace(/^#/, '') || 'home';
    const [hashPath, queryString] = rawHash.split('?');
    const [route, section] = hashPath.split('#');
    const params = new URLSearchParams(queryString || '');

    if (route === 'verify') {
      const code = params.get('code');
      this.navigate('public-verify');
      if (code) {
        setTimeout(() => Certificates.verifyPublic(code), 150);
      }
      return;
    }

    this.navigate(route);

    // Support public-page section links without changing the route.
    if (route === 'home' && section) {
      requestAnimationFrame(() => {
        const target = document.getElementById(section);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  },

  navigate(viewName) {
    this.currentView = viewName;

    // View protection
    const role = Auth.getRole();
    if (viewName.startsWith('owner-') || viewName === 'instruments') {
      if (!Auth.isLoggedIn() || role !== 'owner') {
        if (!Auth.isLoggedIn()) Auth.openLoginModal();
        else showToast('Access restricted to instrument owners.', 'warning');
        return;
      }
    } else if (viewName.startsWith('officer-')) {
      if (!Auth.isLoggedIn() || role !== 'officer') {
        if (!Auth.isLoggedIn()) Auth.openLoginModal();
        else showToast('Access restricted to verified metrology officers.', 'warning');
        return;
      }
    } else if (viewName.startsWith('admin-')) {
      if (!Auth.isLoggedIn() || role !== 'admin') {
        if (!Auth.isLoggedIn()) Auth.openLoginModal();
        else showToast('Access restricted to administrators.', 'warning');
        return;
      }
    }

    // Hide all view containers
    document.querySelectorAll('.view-container').forEach(el => el.style.display = 'none');

    // Show target view
    const targetEl = document.getElementById(`view-${viewName}`);
    if (targetEl) {
      targetEl.style.display = 'block';
    } else {
      // Fallback
      document.getElementById('view-home').style.display = 'block';
      this.currentView = 'home';
    }

    // Public pages use the light public-site navigation theme. Internal
    // role dashboards keep their existing application shell unchanged.
    const isPublicView = ['home', 'public-verify', 'complaint'].includes(viewName);
    const isInternalView = !isPublicView && Auth.isLoggedIn();
    document.body.classList.toggle('public-mode', isPublicView);
    document.body.classList.toggle('internal-mode', isInternalView);

    // The public-site footer is rendered once in index.html, so explicitly
    // control its visibility with the current route. It must never appear
    // inside authenticated Owner/Officer/Admin workspaces.
    const publicFooter = document.querySelector('.public-site-footer');
    if (publicFooter) {
      publicFooter.style.display = isPublicView ? '' : 'none';
      publicFooter.setAttribute('aria-hidden', isPublicView ? 'false' : 'true');
    }

    // Update sidebar / navbar active link
    document.querySelectorAll('.sidebar-menu a, .nav-links a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('data-view') === viewName);
    });

    // View-specific data loaders
    this.onViewLoaded(viewName);

    // Update URL hash safely without infinite loop
    if (window.location.hash.replace('#', '') !== viewName) {
      window.location.hash = viewName;
    }
  },

  onViewLoaded(viewName) {
    if (viewName === 'owner-dashboard') {
      this.loadOwnerDashboard();
    } else if (viewName === 'officer-dashboard') {
      if (window.OfficerDashboard) OfficerDashboard.loadDashboard();
    } else if (viewName === 'admin-dashboard') {
      if (window.Admin) Admin.loadDashboard();
    } else if (viewName === 'instruments') {
      if (window.Instruments) Instruments.loadInstruments();
    } else if (viewName === 'applications') {
      if (window.Applications) Applications.loadApplications();
    } else if (viewName === 'inspections') {
      if (window.Inspections) Inspections.loadInspections();
    } else if (viewName === 'certificates') {
      if (window.Certificates) Certificates.loadCertificates();
    } else if (viewName === 'admin-users') {
      if (window.Admin) Admin.loadUsers();
    } else if (viewName === 'admin-districts') {
      if (window.Admin) Admin.loadDistricts();
    }
  },

  renderAuthUI() {
    const isLogged = Auth.isLoggedIn();
    const user = Auth.currentUser;
    const role = user ? user.role : null;
    document.body.dataset.role = role || '';

    const guestNav = document.getElementById('nav-guest-actions');
    const userNav = document.getElementById('nav-user-actions');
    const sidebar = document.getElementById('app-sidebar');

    if (isLogged && user) {
      if (guestNav) guestNav.style.display = 'none';
      if (userNav) {
        userNav.style.display = 'flex';
        document.getElementById('nav-user-name').innerText = user.full_name;
        document.getElementById('nav-user-role').innerText = role.toUpperCase();
      }
      if (sidebar) {
        sidebar.style.display = 'flex';
        this.renderSidebarMenu(role);
      }

      // Role-aware action buttons for shared list views. These used to be
      // written as template expressions directly inside static index.html,
      // which caused the raw `${...}` text to appear in the browser.
      const instrumentActions = document.getElementById('instruments-header-actions');
      const applicationActions = document.getElementById('applications-header-actions');

      if (instrumentActions) {
        instrumentActions.innerHTML = role === 'owner'
          ? `<button class="btn btn-primary btn-sm" onclick="Instruments.openRegisterModal()"><i class="bi bi-plus-circle"></i> Register Instrument</button>`
          : '';
      }

      if (applicationActions) {
        applicationActions.innerHTML = role === 'owner'
          ? `<button class="btn btn-primary btn-sm" onclick="Applications.openNewWizard()"><i class="bi bi-send-check"></i> New Application</button>`
          : '';
      }
    } else {
      if (guestNav) guestNav.style.display = 'flex';
      if (userNav) userNav.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
    }
  },

  renderSidebarMenu(role) {
    const menu = document.getElementById('sidebar-menu');
    if (!menu) return;

    if (role === 'owner') {
      menu.innerHTML = `
        <li><a href="#owner-dashboard" data-view="owner-dashboard"><i class="bi bi-speedometer2"></i> Dashboard</a></li>
        <li><a href="#instruments" data-view="instruments"><i class="bi bi-scale"></i> My Instruments</a></li>
        <li><a href="#applications" data-view="applications"><i class="bi bi-file-earmark-text"></i> Verification Applications</a></li>
        <li><a href="#inspections" data-view="inspections"><i class="bi bi-calendar-event"></i> Inspection Schedule</a></li>
        <li><a href="#certificates" data-view="certificates"><i class="bi bi-award"></i> Verification Certificates</a></li>
      `;
    } else if (role === 'officer') {
      menu.innerHTML = `
        <li><a href="#officer-dashboard" data-view="officer-dashboard"><i class="bi bi-speedometer2"></i> Officer Dashboard</a></li>
        <li><a href="#applications" data-view="applications"><i class="bi bi-inbox"></i> Assigned Applications</a></li>
        <li><a href="#inspections" data-view="inspections"><i class="bi bi-clipboard-check"></i> Field Inspections</a></li>
        <li><a href="#certificates" data-view="certificates"><i class="bi bi-award"></i> Issued Certificates</a></li>
      `;
    } else if (role === 'admin') {
      menu.innerHTML = `
        <li><a href="#admin-dashboard" data-view="admin-dashboard"><i class="bi bi-speedometer2"></i> Central Dashboard</a></li>
        <li><a href="#admin-users" data-view="admin-users"><i class="bi bi-people"></i> Users & Officers</a></li>
        <li><a href="#admin-districts" data-view="admin-districts"><i class="bi bi-geo-alt"></i> Master Districts</a></li>
        <li><a href="#applications" data-view="applications"><i class="bi bi-file-earmark-medical"></i> All Applications</a></li>
        <li><a href="#certificates" data-view="certificates"><i class="bi bi-award"></i> All Certificates</a></li>
      `;
    }
  },

  /**
   * Owner Dashboard: Live Database Metric Cards (Zero Hardcoded Stats)
   */
  async loadOwnerDashboard() {
    const container = document.getElementById('owner-stats-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Loading real-time instrument statistics...</p></div>';

    const [instRes, appRes, certRes] = await Promise.all([
      apiRequest('/instruments?limit=200'),
      apiRequest('/applications?limit=200'),
      apiRequest('/certificates?limit=200')
    ]);

    const instruments = instRes.data.instruments || [];
    const applications = appRes.data.applications || [];
    const certificates = certRes.data.certificates || [];

    const totalInst = instruments.length;
    const pendingVerification = instruments.filter(i => i.status === 'pending_verification').length;
    const verifiedInst = instruments.filter(i => i.status === 'verified').length;
    const totalApps = applications.length;
    const scheduledInsps = applications.filter(a => a.status === 'inspection_scheduled').length;
    const totalCerts = certificates.length;

    // Expiring certificates (valid until <= 30 days from now)
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);
    const expiringCerts = certificates.filter(c => {
      const exp = new Date(c.expiry_date);
      return exp >= new Date() && exp <= thirtyDaysAhead;
    }).length;

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon primary"><i class="bi bi-scale"></i></div>
          <div class="stat-details">
            <h3>${totalInst}</h3>
            <p>Total Registered Instruments</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon warning"><i class="bi bi-hourglass-split"></i></div>
          <div class="stat-details">
            <h3>${pendingVerification}</h3>
            <p>Pending Verification</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon success"><i class="bi bi-patch-check-fill"></i></div>
          <div class="stat-details">
            <h3>${verifiedInst}</h3>
            <p>Verified Instruments</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i class="bi bi-file-earmark-text"></i></div>
          <div class="stat-details">
            <h3>${totalApps}</h3>
            <p>Total Applications</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon info"><i class="bi bi-calendar2-week"></i></div>
          <div class="stat-details">
            <h3>${scheduledInsps}</h3>
            <p>Scheduled Inspections</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon success"><i class="bi bi-award-fill"></i></div>
          <div class="stat-details">
            <h3>${totalCerts}</h3>
            <p>Digital Certificates</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon ${expiringCerts > 0 ? 'danger' : 'info'}"><i class="bi bi-alarm"></i></div>
          <div class="stat-details">
            <h3>${expiringCerts}</h3>
            <p>Expiring in 30 Days</p>
          </div>
        </div>
      </div>
    `;

    // Load recent instruments into the dashboard's dedicated container.
    // Do not reuse Instruments.loadInstruments(), because the dashboard and
    // the full Instruments view have different DOM containers.
    this.loadDashboardInstruments(instruments);
  },

  async loadDashboardInstruments(instruments = null) {
    const container = document.getElementById('dashboard-instruments-table-container');
    if (!container) return;

    let list = Array.isArray(instruments) ? instruments : [];
    if (!Array.isArray(instruments)) {
      const res = await apiRequest('/instruments?limit=5');
      if (!res.ok) {
        container.innerHTML = `<div class="empty-state text-danger"><p>${res.data?.error || 'Failed to load instruments.'}</p></div>`;
        return;
      }
      list = Array.isArray(res.data?.instruments) ? res.data.instruments : [];
    }

    if (!list.length) {
      container.innerHTML = `<div class="empty-state"><p>No registered instruments found.</p></div>`;
      return;
    }

    const rows = list.slice(0, 5).map(inst => `
      <tr>
        <td><strong style="color:var(--primary);font-family:monospace;">${inst.system_serial_number || 'N/A'}</strong></td>
        <td><div style="font-weight:600;">${inst.instrument_type || 'N/A'}</div><small style="color:var(--text-muted);">${inst.category || ''}</small></td>
        <td><div>${inst.manufacturer || 'N/A'}</div><small style="color:var(--text-muted);">Model: ${inst.model_number || 'N/A'}</small></td>
        <td><strong>${inst.capacity ?? 'N/A'} ${inst.unit_of_measurement || ''}</strong></td>
        <td>${getStatusBadge(inst.status)}</td>
        <td style="text-align:right;"><button class="btn btn-outline btn-sm" onclick="Instruments.viewDetails(${inst.id})"><i class="bi bi-eye"></i> Details</button></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>System Serial No.</th><th>Type & Category</th><th>Manufacturer & Model</th><th>Capacity</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  /**
   * Smart CTA Handler for "Apply for Verification"
   * RULE 32: If user is already logged in as OWNER -> New Verification Wizard.
   * If logged out -> Open login/register modal.
   */
  handleApplyClick() {
    if (Auth.isLoggedIn() && Auth.getRole() === 'owner') {
      Applications.openNewWizard();
    } else if (Auth.isLoggedIn()) {
      showToast('You are signed in as ' + Auth.getRole().toUpperCase() + '. Only registered owners can submit verification applications.', 'info');
    } else {
      Auth.openLoginModal();
    }
  },

  setModal(html) {
    this.closeModal();
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = html;
    }
  },

  closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.innerHTML = '';
    }
  }
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => App.init());
