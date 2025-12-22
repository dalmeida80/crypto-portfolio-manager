import React, { useState } from "react";
import Layout from "../components/Layout";

const Settings: React.FC = () => {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters");
      return;
    }

    setChangingPassword(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to change password");
      }

      setPasswordSuccess("Password changed successfully!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setShowPasswordForm(false);

      setTimeout(() => setPasswordSuccess(""), 5000);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Layout>
      <div className="settings-page">
        <div className="page-header">
          <h1>Settings</h1>
        </div>

        {passwordError && <div className="error-message">{passwordError}</div>}
        {passwordSuccess && (
          <div className="success-message">{passwordSuccess}</div>
        )}

        <div className="settings-section">
          <div className="section-header">
            <h2>🔒 Change Password</h2>
            <button
              onClick={() => setShowPasswordForm(!showPasswordForm)}
              className="btn btn-secondary"
            >
              {showPasswordForm ? "Cancel" : "Change Password"}
            </button>
          </div>

          <p className="section-description">
            Update your account password to keep your account secure.
          </p>

          {showPasswordForm && (
            <div className="api-key-form-card">
              <h3>Change Your Password</h3>
              <form onSubmit={handlePasswordChange}>
                <div className="form-group">
                  <label htmlFor="currentPassword">Current Password *</label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        currentPassword: e.target.value,
                      })
                    }
                    required
                    placeholder="Enter your current password"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="newPassword">New Password *</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value,
                      })
                    }
                    required
                    placeholder="Enter new password (min 6 characters)"
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">
                    Confirm New Password *
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({
                        ...passwordData,
                        confirmPassword: e.target.value,
                      })
                    }
                    required
                    placeholder="Confirm new password"
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={changingPassword}
                >
                  {changingPassword ? "Changing Password..." : "Change Password"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Settings;

