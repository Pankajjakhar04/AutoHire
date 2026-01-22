import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRef, useEffect, useState } from 'react';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/applications', label: 'My applications', roles: ['candidate'] },
  { to: '/recruitment', label: 'Recruitment process', roles: ['hrManager', 'recruiterAdmin'] },
  { to: '/profile', label: 'Profile' }
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLDivElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState({ left: 0, width: 0 });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!navRef.current) return;

    const updateBubblePosition = () => {
      const activeLink = navRef.current?.querySelector('.nav-link.active') as HTMLElement;
      if (activeLink) {
        const left = activeLink.offsetLeft;
        const width = activeLink.offsetWidth;
        setBubbleStyle({ left, width });
      }
    };

    updateBubblePosition();
    window.addEventListener('resize', updateBubblePosition);
    return () => window.removeEventListener('resize', updateBubblePosition);
  }, [location.pathname]);

  const visibleLinks = links.filter((l) => !l.roles || l.roles.includes(user?.role || ''));

  return (
    <div className="app-shell">
      <header className="nav-bar">
        <div className="nav-left">
          <span className="nav-brand">AutoHire</span>
          <nav ref={navRef} className="nav-menu">
            <div 
              className="nav-bubble" 
              style={{
                left: `${bubbleStyle.left}px`,
                width: `${bubbleStyle.width}px`
              }}
            />
            {visibleLinks.map((l) => (
              <Link key={l.to} to={l.to} className={location.pathname.startsWith(l.to) ? 'nav-link active' : 'nav-link'}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="nav-right">
          <span className="nav-user">
            {user?.name || user?.email} ({user?.role === 'recruiterAdmin' ? 'Recruiter Admin' : user?.role === 'hrManager' ? 'HR Manager' : user?.role === 'candidate' ? 'Candidate' : user?.role})
          </span>
          <button className="nav-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
