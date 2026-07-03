'use client';
import { useState, useCallback } from 'react';
import { Notification } from './NotificationDrawer';
import { generateId } from '@/lib/utils';

const INITIAL: Notification[] = [
  { id: '1', type: 'success', title: 'Repository indexed successfully', message: 'helix-backend is ready to explore', timestamp: '2 min ago', read: false },
  { id: '2', type: 'warning', title: '3 security issues found', message: 'Run Code Analysis for details', timestamp: '1 hour ago', read: false },
  { id: '3', type: 'info', title: 'Analysis complete', message: 'Overall health score: 65/100', timestamp: '2 hours ago', read: true },
  { id: '4', type: 'error', title: 'Parsing failed for auth.py', message: 'SyntaxError on line 142', timestamp: 'Yesterday', read: true },
];

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const add = useCallback((n: Omit<Notification, 'id' | 'read' | 'timestamp'>) => {
    setNotifications(prev => [{
      ...n, id: generateId(), read: false, timestamp: 'Just now',
    }, ...prev]);
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  return { notifications, drawerOpen, setDrawerOpen, unreadCount, dismiss, clearAll, add, openDrawer };
}