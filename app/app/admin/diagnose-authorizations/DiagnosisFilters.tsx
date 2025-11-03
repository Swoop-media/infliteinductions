"use client";

import React from 'react';
import { Search, Filter, Calendar, RefreshCw } from 'lucide-react';

interface DiagnosisFiltersProps {
  filters: {
    searchTerm: string;
    excludeCompleted: boolean;
    excludeApproved: boolean;
    statusFilter: string[];
    dateFrom: string;
    dateTo: string;
  };
  onFiltersChange: (filters: any) => void;
  onReset: () => void;
  isLoading: boolean;
}

export default function DiagnosisFilters({ 
  filters, 
  onFiltersChange, 
  onReset,
  isLoading 
}: DiagnosisFiltersProps) {
  const statusOptions = [
    { value: 'assigned', label: 'Assigned' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'pending_approval', label: 'Pending Approval' },
    { value: 'completed', label: 'Completed' },
    { value: 'approved', label: 'Approved' }
  ];

  const handleStatusToggle = (status: string) => {
    const newStatusFilter = filters.statusFilter.includes(status)
      ? filters.statusFilter.filter(s => s !== status)
      : [...filters.statusFilter, status];
    
    onFiltersChange({ ...filters, statusFilter: newStatusFilter });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Diagnosis Filters
        </h3>
        <button
          onClick={onReset}
          disabled={isLoading}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" />
          Reset Filters
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by user name, email, or authorization title..."
          value={filters.searchTerm}
          onChange={(e) => onFiltersChange({ ...filters, searchTerm: e.target.value })}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Quick Filters */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Quick Filters</label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.excludeCompleted}
                onChange={(e) => onFiltersChange({ ...filters, excludeCompleted: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Exclude Completed</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.excludeApproved}
                onChange={(e) => onFiltersChange({ ...filters, excludeApproved: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Exclude Approved</span>
            </label>
          </div>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Status Filter</label>
          <div className="space-y-1">
            {statusOptions.map(option => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.statusFilter.includes(option.value)}
                  onChange={() => handleStatusToggle(option.value)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Date Range</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value })}
                className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm"
                placeholder="From"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value })}
                className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm"
                placeholder="To"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Active Filters Summary */}
      {(filters.searchTerm || filters.statusFilter.length > 0 || filters.dateFrom || filters.dateTo) && (
        <div className="pt-3 border-t">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Active filters:</span>
            {filters.searchTerm && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Search: {filters.searchTerm}
              </span>
            )}
            {filters.statusFilter.length > 0 && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                {filters.statusFilter.length} status{filters.statusFilter.length > 1 ? 'es' : ''}
              </span>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                Date range
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}