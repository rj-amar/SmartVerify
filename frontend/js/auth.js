/**
 * Online Verification System - Authentication Module
 * Secure JWT-Based Role Authentication
 */

const Auth = {
  currentUser: null,

  init() {
    this.currentUser = Storage.getUser();
  },

  isLoggedIn() {
    return !!Storage.getToken() && !!this.currentUser;
  },

  getRole() {
    return this.currentUser ? this.currentUser.role : null;
  },

  async verifySession() {
    const token = Storage.getToken();
    if (!token) {
      this.currentUser = null;
      return false;
    }

    const res = await apiRequest('/auth/me');
    if (res.ok && res.data.user) {
      this.currentUser = res.data.user;
      Storage.setUser(this.currentUser);
      return true;
    } else {
      this.logout(false);
      return false;
    }
  },

  openLoginModal() {
    const modalHtml = `
      <div class="modal-backdrop" id="login-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog" style="max-width:480px;">
          <div class="modal-header">
            <h3><i class="bi bi-shield-lock-fill" style="color:var(--primary-blue);"></i> Statutory Portal Sign In</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form id="login-form" onsubmit="Auth.handleLogin(event)">
            <div class="modal-body">
              <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:18px;">
                Enter your credentials to access the Legal Metrology Online Verification System.
              </p>
              <div class="form-group">
                <label>Registered Email Address <span class="required">*</span></label>
                <input type="email" id="login-email" class="form-control" placeholder="name@business.com" required autocomplete="username" />
              </div>
              <div class="form-group">
                <label>Password <span class="required">*</span></label>
                <input type="password" id="login-password" class="form-control" placeholder="••••••••" required autocomplete="current-password" />
              </div>
              <div class="form-hint" style="margin-top: 14px; background:#F8FAFC; border:1px solid var(--border-color); padding:10px 12px; border-radius:var(--radius-sm); font-size:0.78rem; color:var(--text-muted); display:flex; align-items:flex-start; gap:8px;">
                <i class="bi bi-shield-check" style="color:var(--primary-blue); font-size:1.1rem; flex-shrink:0;"></i>
                <span>Authorized for Registered Owners, Legal Metrology Officers, and Central Directorate Administrators.</span>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary" id="btn-login-submit">
                <i class="bi bi-lock-fill"></i> Secure Sign In
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
    App.setModal(modalHtml);
  },

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const btn = document.getElementById('btn-login-submit');

    if (!email || !password) {
      showToast('Please enter both email and password.', 'warning');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Authenticating...';
    }

    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password }
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-lock-fill"></i> Secure Sign In';
    }

    if (res.ok && res.data.token) {
      Storage.setToken(res.data.token);
      Storage.setUser(res.data.user);
      this.currentUser = res.data.user;

      showToast(`Welcome back, ${res.data.user.full_name}!`, 'success');
      App.closeModal();
      App.renderAuthUI();

      // Route to user's dashboard
      if (this.currentUser.role === 'owner') App.navigate('owner-dashboard');
      else if (this.currentUser.role === 'officer') App.navigate('officer-dashboard');
      else if (this.currentUser.role === 'admin') App.navigate('admin-dashboard');
    } else {
      showToast(res.data.error || 'Login failed. Please check your credentials.', 'danger');
    }
  },

  openRegisterModal() {
    const statesOptions = CONFIG.INDIAN_STATES.map(s => `<option value="${s}">${s}</option>`).join('');

    const modalHtml = `
      <div class="modal-backdrop" id="register-modal" onclick="if(event.target===this) App.closeModal()">
        <div class="modal-dialog modal-dialog-lg">
          <div class="modal-header">
            <h3><i class="bi bi-person-plus-fill" style="color:var(--primary-blue);"></i> Instrument Owner Profile Registration</h3>
            <button class="modal-close" onclick="App.closeModal()">&times;</button>
          </div>
          <form id="register-form" onsubmit="Auth.handleRegister(event)">
            <div class="modal-body">
              <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:18px;">
                Register your business profile to record commercial weighing or measuring equipment, schedule statutory verification inspections, and receive official digital certificates.
              </p>

              <!-- Section 1: Identity & Business -->
              <div class="form-section-title"><i class="bi bi-building"></i> 1. Applicant &amp; Enterprise Details</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Full Name of Owner / Authorized Signatory <span class="required">*</span></label>
                  <input type="text" id="reg-name" class="form-control" placeholder="e.g. Suresh Chandra" required />
                </div>
                <div class="form-group">
                  <label>Business / Enterprise Legal Name <span class="required">*</span></label>
                  <input type="text" id="reg-business" class="form-control" placeholder="e.g. Chandra Mills Pvt Ltd" required />
                </div>
              </div>

              <!-- Section 2: Contact -->
              <div class="form-section-title"><i class="bi bi-telephone"></i> 2. Official Contact Information</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Mobile Number (10 Digits) <span class="required">*</span></label>
                  <input type="tel" id="reg-phone" class="form-control" placeholder="e.g. 9812345678" pattern="[6-9][0-9]{9}" required />
                  <div class="form-hint">Official 10-digit Indian mobile number for SMS inspection notices</div>
                </div>
                <div class="form-group">
                  <label>Official Email Address <span class="required">*</span></label>
                  <input type="email" id="reg-email" class="form-control" placeholder="name@business.com" required />
                </div>
              </div>

              <!-- Section 3: Jurisdiction & Premises -->
              <div class="form-section-title"><i class="bi bi-geo-alt"></i> 3. Jurisdictional Location</div>
              <div class="form-row">
                <div class="form-group">
                  <label>State / Union Territory <span class="required">*</span></label>
                  <select id="reg-state" class="form-control" required>
                    <option value="">-- Select State / UT --</option>
                    ${statesOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>District <span class="required">*</span></label>
                  <input type="text" id="reg-district" class="form-control" placeholder="Enter your district (e.g. Purnea)" required />
                  <div class="form-hint">Used for jurisdictional officer assignment</div>
                </div>
              </div>

              <div class="form-group">
                <label>Official Business / Premises Address <span class="required">*</span></label>
                <textarea id="reg-address" class="form-control" rows="2" placeholder="Full postal address with pincode where instruments are operated" required></textarea>
              </div>

              <!-- Section 4: Password & Security -->
              <div class="form-section-title"><i class="bi bi-lock"></i> 4. Account Security</div>
              <div class="form-row">
                <div class="form-group">
                  <label>Password <span class="required">*</span></label>
                  <input type="password" id="reg-password" class="form-control" placeholder="Minimum 6 characters" minlength="6" required />
                </div>
                <div class="form-group">
                  <label>Confirm Password <span class="required">*</span></label>
                  <input type="password" id="reg-confirm-password" class="form-control" placeholder="Confirm password" minlength="6" required />
                </div>
              </div>

              <div class="form-group" style="margin-top: 14px; background:#F8FAFC; border:1px solid var(--border-color); padding:12px 14px; border-radius:var(--radius-sm);">
                <label style="font-weight: 500; font-size: 0.84rem; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin:0;">
                  <input type="checkbox" id="reg-terms" required style="margin-top: 3px; cursor: pointer;" />
                  <span>I declare under the Legal Metrology Act, 2009 that the information provided is accurate and authentic. <span class="required">*</span></span>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" onclick="App.closeModal()">Cancel</button>
              <button type="submit" class="btn btn-secondary" id="btn-reg-submit">
                <i class="bi bi-check-circle-fill"></i> Complete Registration
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
    const full_name = document.getElementById('reg-name')?.value.trim();
    const business_name = document.getElementById('reg-business')?.value.trim();
    const phone = document.getElementById('reg-phone')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const state = document.getElementById('reg-state')?.value;
    const district = document.getElementById('reg-district')?.value.trim();
    const address = document.getElementById('reg-address')?.value.trim();
    const password = document.getElementById('reg-password')?.value;
    const confirm_password = document.getElementById('reg-confirm-password')?.value;
    const terms_accepted = document.getElementById('reg-terms')?.checked;
    const btn = document.getElementById('btn-reg-submit');

    if (password !== confirm_password) {
      showToast('Password and Confirm Password do not match.', 'danger');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Creating Account...';
    }

    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: {
        full_name,
        business_name,
        phone,
        email,
        state,
        district,
        address,
        password,
        confirm_password,
        terms_accepted
      }
    });

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-circle-fill"></i> Complete Registration';
    }

    if (res.ok && res.data.token) {
      Storage.setToken(res.data.token);
      Storage.setUser(res.data.user);
      this.currentUser = res.data.user;

      showToast('Registration successful! Welcome to the SmartVerify Portal.', 'success');
      App.closeModal();
      App.renderAuthUI();
      App.navigate('owner-dashboard');
    } else {
      showToast(res.data.error || 'Registration failed.', 'danger');
    }
  },

  logout(notify = true) {
    Storage.clearAuth();
    this.currentUser = null;
    if (notify) showToast('You have been logged out securely.', 'info');
    App.renderAuthUI();
    App.navigate('home');
  }
};

window.Auth = Auth;
