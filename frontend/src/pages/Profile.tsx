import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { updateProfile, deleteAccount } from '../services/auth';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [companyName, setCompanyName] = useState(user?.companyName || '');
  const [highestQualificationDegree, setHighestQualificationDegree] = useState(user?.highestQualificationDegree || '');
  const [specialization, setSpecialization] = useState(user?.specialization || '');
  const [cgpaOrPercentage, setCgpaOrPercentage] = useState(user?.cgpaOrPercentage || '');
  const [passoutYear, setPassoutYear] = useState(user?.passoutYear?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateProfile({
        name: name.trim(),
        employeeId: employeeId?.trim(),
        companyName: companyName?.trim(),
        highestQualificationDegree: highestQualificationDegree.trim(),
        specialization: specialization.trim(),
        cgpaOrPercentage: cgpaOrPercentage.trim(),
        passoutYear: passoutYear ? parseInt(passoutYear) : undefined
      });
      
      // Update localStorage with the returned user data
      if (response.user) {
        localStorage.setItem('user', JSON.stringify(response.user));
        
        // Update local state with the latest data from server
        setName(response.user.name || '');
        setEmployeeId(response.user.employeeId || '');
        setCompanyName(response.user.companyName || '');
        setHighestQualificationDegree(response.user.highestQualificationDegree || '');
        setSpecialization(response.user.specialization || '');
        setCgpaOrPercentage(response.user.cgpaOrPercentage || '');
        setPassoutYear(response.user.passoutYear?.toString() || '');
      }
      
      setSuccess('Profile updated successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmInput !== 'confirm') {
      setError('Please type "confirm" to delete your account');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      await deleteAccount();
      await logout();
      navigate('/login');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete account');
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>My Profile</h1>
      </div>

      <div className="card" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {user?.role === 'candidate' && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Candidate ID</label>
                <input 
                  type="text" 
                  value={user?.candidateId || 'Not assigned'} 
                  disabled 
                  style={{ background: '#f8fafc', cursor: 'not-allowed' }}
                />
              </div>
            )}

            {(user?.role === 'hrManager' || user?.role === 'recruiterAdmin') && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Employee ID</label>
                <input 
                  type="text" 
                  value={employeeId} 
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g., EMP-001"
                />
              </div>
            )}

            {(user?.role === 'hrManager' || user?.role === 'recruiterAdmin') && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Company Name</label>
                <input 
                  type="text" 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., ABC Corp"
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Email</label>
              <input 
                type="email" 
                value={user?.email || ''} 
                disabled 
                style={{ background: '#f8fafc', cursor: 'not-allowed' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>

            {user?.role === 'candidate' && (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Highest Qualification</label>
                  <select
                    value={highestQualificationDegree}
                    onChange={(e) => setHighestQualificationDegree(e.target.value)}
                    required
                  >
                    <option value="">Select qualification</option>
                    <option value="High School">High School</option>
                    <option value="Diploma">Diploma</option>
                    <option value="Bachelor's">Bachelor's</option>
                    <option value="Master's">Master's</option>
                    <option value="PhD">PhD</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Specialization</label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g., Computer Science"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>CGPA / Percentage</label>
                  <input
                    type="text"
                    value={cgpaOrPercentage}
                    onChange={(e) => setCgpaOrPercentage(e.target.value)}
                    placeholder="e.g., 8.5 or 85%"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Passout Year</label>
                  <input
                    type="number"
                    value={passoutYear}
                    onChange={(e) => setPassoutYear(e.target.value)}
                    placeholder="e.g., 2024"
                    min="1950"
                    max="2050"
                    required
                  />
                </div>
              </>
            )}
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success-message">{success}</p>}

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button type="submit" disabled={loading} style={{ width: 'fit-content' }}>
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
            
            <button 
              type="button" 
              onClick={() => setShowDeleteModal(true)} 
              disabled={loading}
              className="btn-danger"
              style={{ width: 'fit-content' }}
            >
              Delete Account
            </button>
          </div>
        </form>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            backdropFilter: 'blur(12px)',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#1F2937' }}>Delete Account</h2>
            
            <p style={{ color: '#4B5563', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              This action is permanent and cannot be undone. Your account and all associated data will be deleted.
            </p>

            <p style={{ color: '#DC2626', fontWeight: 600, marginBottom: '1.5rem' }}>
              ⚠️ All your applications will be withdrawn.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#1F2937' }}>
                Type "confirm" to proceed:
              </label>
              <input
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => {
                  setDeleteConfirmInput(e.target.value);
                  setError('');
                }}
                placeholder='Type "confirm" here'
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: `2px solid ${deleteConfirmInput === 'confirm' ? '#059669' : '#D1D5DB'}`,
                  borderRadius: '8px',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>

            {error && <p style={{ color: '#DC2626', marginBottom: '1rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmInput('');
                  setError('');
                }}
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  backgroundColor: '#F3F4F6',
                  color: '#1F2937',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={loading || deleteConfirmInput !== 'confirm'}
                className="btn-danger"
                style={{
                  opacity: deleteConfirmInput === 'confirm' ? 1 : 0.5,
                  cursor: deleteConfirmInput === 'confirm' ? 'pointer' : 'not-allowed'
                }}
              >
                {loading ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}