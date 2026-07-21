// src/app/pages/AdminDocsPage.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { 
  Plus, Trash2, Edit, Save, X, Upload, FileText, Link 
} from 'lucide-react';

interface Guide {
  id: string;
  title: string;
  read_time: string;
  icon: string;
  type: string;
  url: string;
  file_url: string;
  is_downloadable: boolean;
  sort_order: number;
}

export default function AdminDocsPage() {
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Guide>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGuide, setNewGuide] = useState({
    title: '',
    read_time: '5 min',
    icon: '📘',
    type: 'Guide',
    url: '',
    file_url: '',
    is_downloadable: false,
    sort_order: 0
  });

  const { session } = useApp();
  const token = localStorage.getItem("token") || session?.access_token;

  useEffect(() => {
    fetchGuides();
  }, []);

  const fetchGuides = async () => {
    try {
      const data = await api.guides.list(token);
      if (data) {
        setGuides(data);
      }
    } catch (error: any) {
      console.error("Error fetching guides:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGuide = async () => {
    if (!newGuide.title) {
      alert('Please enter a title');
      return;
    }

    try {
      await api.guides.create(newGuide, token);
      alert('Guide added successfully!');
      setShowAddForm(false);
      setNewGuide({
        title: '',
        read_time: '5 min',
        icon: '📘',
        type: 'Guide',
        url: '',
        file_url: '',
        is_downloadable: false,
        sort_order: 0
      });
      fetchGuides();
    } catch (error: any) {
      alert('Error adding guide: ' + error.message);
    }
  };

  const handleUpdateGuide = async (id: string) => {
    try {
      await api.guides.update(id, editForm, token);
      alert('Guide updated successfully!');
      setEditingId(null);
      fetchGuides();
    } catch (error: any) {
      alert('Error updating guide: ' + error.message);
    }
  };

  const handleDeleteGuide = async (id: string) => {
    if (confirm('Are you sure you want to delete this guide?')) {
      try {
        await api.guides.delete(id, token);
        alert('Guide deleted successfully!');
        fetchGuides();
      } catch (error: any) {
        alert('Error deleting guide: ' + error.message);
      }
    }
  };

  const startEdit = (guide: Guide) => {
    setEditingId(guide.id);
    setEditForm(guide);
  };

  if (loading) return <div className="p-8 text-center">Loading guides...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📚 Manage Guides & Documentation</h1>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700"
        >
          <Plus size={16} /> Add New Guide
        </button>
      </div>

      {/* Add New Guide Form */}
      {showAddForm && (
        <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Add New Guide</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Title *"
              value={newGuide.title}
              onChange={(e) => setNewGuide({ ...newGuide, title: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              placeholder="Read time (e.g., 5 min)"
              value={newGuide.read_time}
              onChange={(e) => setNewGuide({ ...newGuide, read_time: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              placeholder="Icon (emoji) e.g., 🚀"
              value={newGuide.icon}
              onChange={(e) => setNewGuide({ ...newGuide, icon: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            />
            <select
              value={newGuide.type}
              onChange={(e) => setNewGuide({ ...newGuide, type: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="Guide">Guide</option>
              <option value="Tutorial">Tutorial</option>
              <option value="Video">Video</option>
            </select>
            <input
              type="url"
              placeholder="PDF/File URL (optional)"
              value={newGuide.file_url}
              onChange={(e) => setNewGuide({ ...newGuide, file_url: e.target.value })}
              className="px-3 py-2 border rounded-lg col-span-2"
            />
            <div className="col-span-2 flex gap-2">
              <button onClick={handleAddGuide} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save</button>
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Guides List Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm">Icon</th>
              <th className="px-4 py-3 text-left text-sm">Title</th>
              <th className="px-4 py-3 text-left text-sm">Type</th>
              <th className="px-4 py-3 text-left text-sm">Time</th>
              <th className="px-4 py-3 text-left text-sm">File</th>
              <th className="px-4 py-3 text-left text-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {guides.map((guide) => (
              <tr key={guide.id} className="hover:bg-gray-50">
                {editingId === guide.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.icon}
                        onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                        className="px-2 py-1 border rounded w-16"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="px-2 py-1 border rounded w-48"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                        className="px-2 py-1 border rounded"
                      >
                        <option value="Guide">Guide</option>
                        <option value="Tutorial">Tutorial</option>
                        <option value="Video">Video</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.read_time}
                        onChange={(e) => setEditForm({ ...editForm, read_time: e.target.value })}
                        className="px-2 py-1 border rounded w-20"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editForm.file_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, file_url: e.target.value })}
                        placeholder="PDF URL"
                        className="px-2 py-1 border rounded w-40 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateGuide(guide.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <Save size={16} />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-2xl">{guide.icon}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{guide.title}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        guide.type === 'Video' ? 'bg-red-100 text-red-700' :
                        guide.type === 'Tutorial' ? 'bg-blue-100 text-blue-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {guide.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{guide.read_time}</td>
                    <td className="px-4 py-3">
                      {guide.file_url ? (
                        <a href={guide.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-sm flex items-center gap-1">
                          <FileText size={12} /> View PDF
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">No file</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(guide)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDeleteGuide(guide.id)} className="p-1 text-red-600 hover:bg-red-50 rounded">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}