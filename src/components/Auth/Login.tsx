import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, UserPlus, ArrowRight, User, Mail, Lock, Key, RefreshCw } from 'lucide-react';
import { 
  signInWithGoogle, 
  db, 
  auth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  updateProfile
} from '../../firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestore-errors';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot' | 'setup';

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
  };

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already in use. Please sign in instead.';
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      default:
        return 'Authentication failed. Please try again.';
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const user = await signInWithGoogle();
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        onLoginSuccess(userDoc.data());
      } else {
        setDisplayName(user.displayName || '');
        setUniqueId(generateUniqueId());
        setMode('setup');
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code) || err.message || 'Failed to login with Google');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Initial profile update
        await updateProfile(user, { displayName });
        
        // Move to setup step to confirm uniqueId and display name
        setUniqueId(generateUniqueId());
        setMode('setup');
      } else if (mode === 'signin') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          onLoginSuccess(userDoc.data());
        } else {
          // This shouldn't happen if they signed up correctly, but handle it
          setDisplayName(user.displayName || '');
          setUniqueId(generateUniqueId());
          setMode('setup');
        }
      } else if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, email);
        setSuccess('Password reset email sent! Check your inbox.');
        setTimeout(() => setMode('signin'), 3000);
      }
    } catch (err: any) {
      setError(getErrorMessage(err.code) || err.message || 'Authentication failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async () => {
    if (!displayName || !uniqueId) return;
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const userData = {
        uid: user.uid,
        uniqueId: uniqueId.toUpperCase(),
        displayName,
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        bio: 'Hey there! I am using WhatsApp Clone.',
        status: 'online',
        lastSeen: serverTimestamp()
      };

      await setDoc(doc(db, 'users', user.uid), userData, { merge: true });
      onLoginSuccess(userData);
    } catch (err: any) {
      setError(err.message || 'Failed to complete setup');
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser?.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#f0f2f5] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8"
      >
        <div className="w-20 h-20 bg-[#25d366] rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-lg">
          <User size={40} />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">WhatsApp Clone</h1>
          <p className="text-gray-500">
            {mode === 'signin' && 'Welcome back! Sign in to continue'}
            {mode === 'signup' && 'Create an account to get started'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'setup' && 'Complete your profile'}
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100 flex flex-col gap-2"
          >
            <p>{error}</p>
            {error.includes('already in use') && mode === 'signup' && (
              <button 
                type="button"
                onClick={() => setMode('signin')}
                className="text-[#00a884] font-bold hover:underline text-left"
              >
                Switch to Sign In
              </button>
            )}
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-green-50 text-green-600 p-3 rounded-lg text-sm mb-4 border border-green-100"
          >
            {success}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {mode !== 'setup' ? (
            <motion.form
              key={mode}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleEmailAuth}
              className="space-y-4"
            >
              {mode === 'signup' && (
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Full Name"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25d366] outline-none transition-all"
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="email"
                  placeholder="Email Address"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25d366] outline-none transition-all"
                />
              </div>

              {mode !== 'forgot' && (
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="password"
                    placeholder="Password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25d366] outline-none transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[#25d366] text-white rounded-xl font-bold text-lg hover:bg-[#128c7e] transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="animate-spin" size={20} />
                ) : (
                  <>
                    {mode === 'signin' && 'Sign In'}
                    {mode === 'signup' && 'Sign Up'}
                    {mode === 'forgot' && 'Send Reset Link'}
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              <div className="flex flex-col gap-3 pt-4">
                {mode === 'signin' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-sm text-gray-500 hover:text-[#25d366] transition-colors"
                    >
                      Forgot Password?
                    </button>
                    <div className="flex items-center gap-2 text-sm text-gray-500 justify-center">
                      Don't have an account?
                      <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className="font-bold text-[#25d366] hover:underline"
                      >
                        Sign Up
                      </button>
                    </div>
                  </>
                )}

                {mode === 'signup' && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 justify-center">
                    Already have an account?
                    <button
                      type="button"
                      onClick={() => setMode('signin')}
                      className="font-bold text-[#25d366] hover:underline"
                    >
                      Sign In
                    </button>
                  </div>
                )}

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="text-sm font-bold text-[#25d366] hover:underline"
                  >
                    Back to Sign In
                  </button>
                )}

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500 uppercase tracking-wider">Or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full py-4 bg-white border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                  Google
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Display Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25d366] outline-none transition-all"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Your Unique ID</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        value={uniqueId}
                        onChange={(e) => setUniqueId(e.target.value.toUpperCase())}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#25d366] outline-none transition-all font-mono font-bold"
                      />
                    </div>
                    <button 
                      onClick={() => setUniqueId(generateUniqueId())}
                      className="px-4 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                      title="Regenerate ID"
                    >
                      <RefreshCw size={20} className="text-gray-600" />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2 px-1">This ID will be used by others to find and connect with you.</p>
                </div>
              </div>

              <button
                onClick={handleSetup}
                disabled={loading || !displayName || !uniqueId}
                className="w-full py-4 bg-[#25d366] text-white rounded-xl font-bold text-lg hover:bg-[#128c7e] transition-colors flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {loading ? <RefreshCw className="animate-spin" size={20} /> : 'Start Chatting'}
                {!loading && <ArrowRight size={20} />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
