import React from "react";
import { AlertTriangle } from "lucide-react";

interface DeleteCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  commentText: string;
}

export default function DeleteCommentModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  commentText,
}: DeleteCommentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Warning Icon */}
        <div className="flex items-center justify-center pt-6">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-2">
            Delete Comment?
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
            This action cannot be undone.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg mt-2">
            "{commentText.slice(0, 100)}{commentText.length > 100 ? "..." : ""}"
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
