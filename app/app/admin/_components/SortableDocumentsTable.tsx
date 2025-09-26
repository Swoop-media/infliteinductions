// @ts-nocheck

"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type Document = {
  id: string;
  title: string;
  expires_on: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string | null;
  } | null;
  courses: {
    title: string | null;
  } | null;
  course_modules: {
    title: string | null;
  } | null;
};

type SortField = 'user' | 'document' | 'expiry' | 'status';
type SortDirection = 'asc' | 'desc';

interface Props {
  documents: Document[];
}

function getSortIcon(column: SortField, sortField: SortField | null, sortDirection: SortDirection) {
  if (sortField !== column) {
    return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
  }
  return sortDirection === 'asc'
    ? <ChevronUp className="h-4 w-4 text-blue-600" />
    : <ChevronDown className="h-4 w-4 text-blue-600" />;
}

function getDocumentStatus(expiresOn: string | null): { status: string; className: string } {
  if (!expiresOn) {
    return { status: 'No expiry', className: 'bg-gray-100 text-gray-800' };
  }

  const expiryDate = new Date(expiresOn);
  const today = new Date();
  const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return { status: 'Expired', className: 'bg-red-100 text-red-800' };
  } else if (daysDiff <= 30) {
    return { status: 'Expiring soon', className: 'bg-yellow-100 text-yellow-800' };
  } else {
    return { status: 'Valid', className: 'bg-green-100 text-green-800' };
  }
}

export default function SortableDocumentsTable({ documents }: Props) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedDocuments = useMemo(() => {
    if (!sortField) return documents;

    return [...documents].sort((a, b) => {
      let aValue: string;
      let bValue: string;

      switch (sortField) {
        case 'user':
          aValue = a.profiles?.full_name || a.profiles?.email || '';
          bValue = b.profiles?.full_name || b.profiles?.email || '';
          break;
        case 'document':
          aValue = a.title || '';
          bValue = b.title || '';
          break;
        case 'expiry':
          aValue = a.expires_on || '';
          bValue = b.expires_on || '';
          break;
        case 'status':
          aValue = getDocumentStatus(a.expires_on).status;
          bValue = getDocumentStatus(b.expires_on).status;
          break;
        default:
          return 0;
      }

      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
  }, [documents, sortField, sortDirection]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Document Expiry Overview</h2>
        <div className="text-sm text-gray-600">
          {documents.length} document{documents.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('user')}
              >
                <div className="flex items-center justify-between">
                  User Name
                  {getSortIcon('user', sortField, sortDirection)}
                </div>
              </th>
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('document')}
              >
                <div className="flex items-center justify-between">
                  Document Name
                  {getSortIcon('document', sortField, sortDirection)}
                </div>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                Course/Module
              </th>
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('expiry')}
              >
                <div className="flex items-center justify-between">
                  Expiry Date
                  {getSortIcon('expiry', sortField, sortDirection)}
                </div>
              </th>
              <th
                className="px-3 py-2 text-left font-medium cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-between">
                  Status
                  {getSortIcon('status', sortField, sortDirection)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y bg-white">
            {sortedDocuments.map((doc) => {
              const { status, className } = getDocumentStatus(doc.expires_on);
              
              return (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {doc.profiles?.full_name || doc.profiles?.email || 'Unknown User'}
                  </td>
                  <td className="px-3 py-2">
                    {doc.title}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    <div className="text-sm">
                      <div>{doc.courses?.title || 'Unknown Course'}</div>
                      <div className="text-xs text-gray-500">
                        {doc.course_modules?.title || 'Unknown Module'}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {doc.expires_on ? new Date(doc.expires_on).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'No expiry'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${className}`}>
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {documents.length === 0 && (
        <div className="rounded-md border bg-white p-4 text-sm text-gray-600">
          No documents found.
        </div>
      )}
    </div>
  );
}
