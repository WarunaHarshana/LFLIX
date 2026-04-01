'use client';

import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
};

const shortcuts = [
    { section: 'Navigation', items: [
        { keys: ['←', '→', '↑', '↓'], desc: 'Navigate library grid' },
        { keys: ['Enter'], desc: 'Open selected item' },
        { keys: ['Esc'], desc: 'Close modal / menu' },
    ]},
    { section: 'Actions', items: [
        { keys: ['/'], desc: 'Focus search bar' },
        { keys: ['F'], desc: 'Open folder manager' },
        { keys: ['?'], desc: 'Show this help' },
    ]},
    { section: 'Playback', items: [
        { keys: ['Space'], desc: 'Play / Pause' },
        { keys: ['F11'], desc: 'Toggle fullscreen' },
        { keys: ['M'], desc: 'Mute / Unmute' },
    ]},
];

export default function KeyboardShortcuts({ isOpen, onClose }: Props) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === '?') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-neutral-900 border border-neutral-700/50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-neutral-800 rounded-lg">
                            <Keyboard className="w-5 h-5 text-neutral-300" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition"
                    >
                        <X className="w-5 h-5 text-neutral-400" />
                    </button>
                </div>

                {/* Shortcuts */}
                <div className="px-6 py-4 space-y-6 max-h-[60vh] overflow-y-auto">
                    {shortcuts.map((section) => (
                        <div key={section.section}>
                            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                                {section.section}
                            </h3>
                            <div className="space-y-2">
                                {section.items.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between py-1.5">
                                        <span className="text-sm text-neutral-300">{item.desc}</span>
                                        <div className="flex items-center gap-1.5">
                                            {item.keys.map((key, ki) => (
                                                <kbd
                                                    key={ki}
                                                    className="min-w-[28px] px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-md text-xs font-mono text-neutral-200 text-center shadow-sm"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900/50">
                    <p className="text-xs text-neutral-500 text-center">
                        Press <kbd className="px-1.5 py-0.5 bg-neutral-800 border border-neutral-600 rounded text-[10px] font-mono text-neutral-300">?</kbd> to toggle this overlay
                    </p>
                </div>
            </div>
        </div>
    );
}
