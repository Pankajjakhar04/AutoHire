import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import './styles/background.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import JobsList from './pages/JobsList';
import JobEditor from './pages/JobEditor';
import JobDetail from './pages/JobDetail';
import MyApplications from './pages/MyApplications';
import RecruitmentProcess from './pages/RecruitmentProcess';
import Profile from './pages/Profile';

function App() {
  return (
    <>
      <div className="background-container"></div>
      <div className="background-overlay"></div>
      <div className="content-wrapper">
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/jobs" element={<JobsList />} />
                  <Route path="/jobs/new" element={<JobEditor />} />
                  <Route path="/jobs/:id" element={<JobDetail />} />
                  <Route path="/jobs/:id/edit" element={<JobEditor />} />
                  <Route path="/applications" element={<MyApplications />} />
                  <Route path="/recruitment" element={<RecruitmentProcess />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </div>
    </>
  );
}

export default App;
