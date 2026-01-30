import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

type AdminLayoutProps = {
  children: ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: '8px 12px',
    textDecoration: 'none',
    borderRadius: '6px',
    color: isActive ? '#fff' : '#1f2a44',
    backgroundColor: isActive ? '#1f2a44' : 'transparent',
    border: isActive ? '1px solid #1f2a44' : '1px solid transparent',
    fontWeight: 600,
    fontSize: '14px',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7f8fa' }}>
      <header
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e7eb',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Admin</div>
            <div style={{ color: '#6b7280', fontSize: '13px' }}>
              Panel de administración
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#fff',
              color: '#111827',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: '24px',
          padding: '24px',
        }}
      >
        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '12px',
            height: 'fit-content',
          }}
        >
          <NavLink to="/admin" style={navLinkStyle} end>
            Dashboard
          </NavLink>
          <NavLink to="/admin/specialties" style={navLinkStyle}>
            Specialties
          </NavLink>
        </nav>

        <main>{children}</main>
      </div>
    </div>
  );
}
