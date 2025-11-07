// auth.js
const API = 'http://localhost:5000';

async function checkAuth() {
  const res = await fetch(`${API}/api/me`, { credentials: 'include' });
  if (res.ok) {
    const data = await res.json();
    updateNavbar(data.user);
    return data.user;
  } else {
    updateNavbar(null);
    return null;
  }
}

function updateNavbar(user) {
  const loginBtn = document.querySelectorAll('.login-btn');
  loginBtn.forEach(btn => {
    if (user) {
      btn.innerHTML = `
        <span>${user.name.split(' ')[0]}</span>
        <div class="profile-dropdown" style="display:none; position:absolute; right:0; background:white; border:1px solid #ddd; border-radius:8px; margin-top:8px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          <a href="#" onclick="logout(); return false;" style="display:block; padding:10px 16px; color:#333; text-decoration:none;">Logout</a>
        </div>
      `;
      btn.style.position = 'relative';
      btn.onmouseover = () => btn.querySelector('.profile-dropdown').style.display = 'block';
      btn.onmouseout = () => btn.querySelector('.profile-dropdown').style.display = 'none';
    } else {
      btn.innerHTML = 'Login';
      btn.onclick = () => {
        const redirect = encodeURIComponent(location.href);
        location.href = `login.html?redirect=${redirect}`;
      };
    }
  });
}

async function logout() {
  await fetch(`${API}/api/logout`, { method: 'POST', credentials: 'include' });
  location.reload();
}

// Auto-check on load
document.addEventListener('DOMContentLoaded', checkAuth);