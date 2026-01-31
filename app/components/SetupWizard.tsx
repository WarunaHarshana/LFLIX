'use client';

import { useState } from 'react';
import { Lock, Key, FolderOpen, Check, ChevronRight, ChevronLeft, Play } from 'lucide-react';
import FileBrowser from './FileBrowser';

type Props = {
  onComplete: () => void;
};

export default function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  const totalSteps = 4;

  const handleNext = () => {
    setError('');
    if (step === 1 && pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (step === 2 && apiKey.length < 10) {
      setError('Please enter a valid TMDB API key');
      return;
    }
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleAddFolder = () => {
    if (newFolder.trim() && !folders.includes(newFolder.trim())) {
      setFolders([...folders, newFolder.trim()]);
      setNewFolder('');
    }
  };

  const handleRemoveFolder = (index: number) => {
    setFolders(folders.filter((_, i) => i !== index));
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // Save settings
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, apiKey, folders })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Setup failed');
      }

      onComplete();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: 'Security', description: 'Create a PIN' },
    { number: 2, title: 'API Key', description: 'TMDB Configuration' },
    { number: 3, title: 'Folders', description: 'Add Media Folders' },
    { number: 4, title: 'Ready', description: 'Start Watching' },
  ];

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-900 to-red-700 p-8 text-center">
          <h1 className="text-4xl font-bold text-white tracking-tighter mb-2">LOCALFLIX</h1>
          <p className="text-red-200">Your Personal Media Server</p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center p-6 border-b border-neutral-800">
          {steps.map((s, idx) => (
            <div key={s.number} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                step >= s.number ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {step > s.number ? <Check className="w-4 h-4" /> : s.number}
              </div>
              <div className="hidden sm:block ml-2 mr-4">
                <p className={`text-xs font-medium ${step >= s.number ? 'text-white' : 'text-neutral-500'}`}>
                  {s.title}
                </p>
                <p className="text-[10px] text-neutral-600">{s.description}</p>
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-2 ${step > s.number ? 'bg-red-600' : 'bg-neutral-800'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="p-8 min-h-[300px]">
          {/* Step 1: PIN */}
          {step === 1 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Create a PIN</h2>
              <p className="text-neutral-400 mb-6">This keeps your media library secure</p>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Enter 4-6 digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full max-w-xs mx-auto block bg-black border border-neutral-700 rounded-lg px-4 py-3 text-center text-2xl tracking-widest outline-none focus:border-red-600 transition"
                autoFocus
              />
            </div>
          )}

          {/* Step 2: API Key */}
          {step === 2 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">TMDB API Key</h2>
              <p className="text-neutral-400 mb-2">Needed to fetch movie & show info</p>
              <a 
                href="https://www.themoviedb.org/settings/api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 text-sm hover:underline mb-6 block"
              >
                Get free API key from themoviedb.org →
              </a>
              <input
                type="text"
                placeholder="Paste your TMDB API key here"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-3 outline-none focus:border-red-600 transition font-mono text-sm"
                autoFocus
              />
              <p className="text-xs text-neutral-500 mt-2">
                Example: 3d8c8476371d0730fb5bd7ae67241879
              </p>
            </div>
          )}

          {/* Step 3: Folders */}
          {step === 3 && (
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FolderOpen className="w-8 h-8 text-yellow-500" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Add Media Folders</h2>
                <p className="text-neutral-400">Select folders with your movies & TV shows</p>
              </div>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="e.g., D:\\Movies or F:\\TV Shows"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
                  className="flex-1 bg-black border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-red-600 transition text-sm"
                />
                <button
                  onClick={() => setShowBrowser(true)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                >
                  Browse...
                </button>
                <button
                  onClick={handleAddFolder}
                  disabled={!newFolder.trim()}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg transition"
                >
                  Add
                </button>
              </div>

              {folders.length === 0 ? (
                <div className="text-center py-8 bg-neutral-800/30 rounded-lg border border-dashed border-neutral-700">
                  <p className="text-neutral-500 text-sm">No folders added yet</p>
                  <p className="text-neutral-600 text-xs mt-1">You can add folders later too</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {folders.map((folder, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-neutral-800/50 px-4 py-3 rounded-lg">
                      <span className="text-sm truncate flex-1 font-mono">{folder}</span>
                      <button
                        onClick={() => handleRemoveFolder(idx)}
                        className="text-red-400 hover:text-red-300 text-sm ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Ready */}
          {step === 4 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-green-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
              <div className="text-left bg-neutral-800/50 rounded-lg p-4 mb-6 text-sm space-y-2">
                <p><span className="text-neutral-500">PIN:</span> <span className="text-green-400">✓ Set</span></p>
                <p><span className="text-neutral-500">API Key:</span> <span className="text-green-400">✓ Configured</span></p>
                <p><span className="text-neutral-500">Folders:</span> <span className={folders.length > 0 ? 'text-green-400' : 'text-yellow-400'}>
                  {folders.length > 0 ? `✓ ${folders.length} folder(s)` : '⚠ None (can add later)'}
                </span></p>
              </div>
              <p className="text-neutral-400 text-sm mb-4">
                LocalFlix will scan your folders and automatically organize your media.
              </p>
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="p-6 border-t border-neutral-800 flex justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2 text-neutral-400 hover:text-white disabled:opacity-30 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {step < totalSteps ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition disabled:opacity-50"
            >
              {loading ? 'Setting up...' : 'Start LocalFlix'} <Play className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* File Browser Modal */}
      {showBrowser && (
        <FileBrowser
          onSelect={(selectedPath) => {
            setShowBrowser(false);
            if (selectedPath && !folders.includes(selectedPath)) {
              setFolders([...folders, selectedPath]);
            }
          }}
          onCancel={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
