// SessionNameModal.tsx
import { useState } from 'react';
import { X } from 'lucide-react';

interface SessionNameModalProps {
    isOpen: boolean;
    title?: string;
    submitLabel?: string;
    initialName?: string;
    onSave: (name: string) => void;
    onClose: () => void;
}

export function SessionNameModal({
    isOpen,
    title = 'Create New Session',
    submitLabel = 'Create Session',
    initialName = '',
    onSave,
    onClose,
}: SessionNameModalProps) {
    if (!isOpen) return null;

    return (
        <SessionNameModalContent
            title={title}
            submitLabel={submitLabel}
            initialName={initialName}
            onSave={onSave}
            onClose={onClose}
        />
    );
}

interface SessionNameModalContentProps {
    title: string;
    submitLabel: string;
    initialName: string;
    onSave: (name: string) => void;
    onClose: () => void;
}

function SessionNameModalContent({
    title,
    submitLabel,
    initialName,
    onSave,
    onClose,
}: SessionNameModalContentProps) {
    const [name, setName] = useState(initialName);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim());
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="w-full max-w-md bg-card border border-border rounded-lg shadow-lg animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label htmlFor="session-name" className="block text-sm font-medium mb-1.5">
                            Session Name
                        </label>
                        <input
                            id="session-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter session name..."
                            className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                        >
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
