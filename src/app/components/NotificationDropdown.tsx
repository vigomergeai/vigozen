import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, Trash2, CheckCheck } from "lucide-react";
import { useApp } from "../context/AppContext";

interface NotificationDropdownProps {
  onClose?: () => void;
}

export default function NotificationDropdown({ onClose }: NotificationDropdownProps) {
    const { 
        notificationItems, 
        unreadCount, 
        markNotificationRead, 
        markAllNotificationsRead, 
        deleteNotification 
    } = useApp();
    
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                if (onClose) onClose();
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Close dropdown when Escape key is pressed
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && isOpen) {
                setIsOpen(false);
                if (onClose) onClose();
            }
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    const getTimeGroup = (date: string) => {
        const now = new Date();
        const created = new Date(date);
        const diff = now.getTime() - created.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days < 7) return "This Week";
        return "Older";
    };

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'high': 
                return 'bg-red-100 text-red-700 border-red-200';
            case 'medium': 
                return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'low': 
                return 'bg-green-100 text-green-700 border-green-200';
            default: 
                return 'bg-slate-100 text-slate-500 border-slate-200';
        }
    };

    // Group notifications by time
    const groupedNotifications = notificationItems.reduce((acc, n) => {
        const group = getTimeGroup(n.created_at);
        if (!acc[group]) acc[group] = [];
        acc[group].push(n);
        return acc;
    }, {} as Record<string, typeof notificationItems>);

    const handleNotificationClick = (n: any) => {
        if (n.link) {
            window.location.href = n.link;
        }
        if (!n.is_read) {  // ✅ Correct field
            markNotificationRead(n.id);
        }
        setIsOpen(false);
        if (onClose) onClose();
    };

    const handleMarkAllRead = () => {
        markAllNotificationsRead();
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        deleteNotification(id);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon with Badge */}
            <button
                onClick={toggleDropdown}
                className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label="Notifications"
            >
                <Bell size={18} className="text-slate-500" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-[380px] max-w-[90vw] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 max-h-[500px] flex flex-col">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                        <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            Notifications
                            {unreadCount > 0 && (
                                <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </span>
                        {unreadCount > 0 && (
                            <button
                                onClick={handleMarkAllRead}
                                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition-colors"
                            >
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notification List */}
                    <div className="flex-1 overflow-y-auto">
                        {notificationItems.length === 0 ? (
                            <div className="py-12 text-center text-sm text-slate-400">
                                <Bell size={32} className="mx-auto mb-2 text-slate-300" />
                                No notifications yet
                            </div>
                        ) : (
                            Object.entries(groupedNotifications).map(([group, items]) => (
                                <div key={group}>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold text-slate-400 bg-slate-50 uppercase tracking-wider">
                                        {group}
                                    </div>
                                    {items.map((n) => (
                                        <div
                                            key={n.id}
                                            className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer ${
                                                !n.is_read ? 'bg-indigo-50/30' : ''
                                            }`}
                                            onClick={() => handleNotificationClick(n)}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-medium text-slate-800">
                                                            {n.title}
                                                        </span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getPriorityColor(n.priority)}`}>
                                                            {n.priority || 'low'}
                                                        </span>
                                                        {n.type && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                                                {n.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                                                        {n.message}
                                                    </p>
                                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                                        {new Date(n.created_at).toLocaleTimeString([], { 
                                                            hour: '2-digit', 
                                                            minute: '2-digit' 
                                                        })}
                                                    </span>
                                                </div>
                                                {!n.is_read && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5" />
                                                )}
                                                <button
                                                    onClick={(e) => handleDelete(e, n.id)}
                                                    className="p-1 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                                    aria-label="Delete notification"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}