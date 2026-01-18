"use client"

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function WebPriceResultsPage() {
  const priceRecords = useQuery(api.management.listPriceRecords);
  const webPriceRecords = (priceRecords ?? []).filter((record: any) => record.sourceType === "web");

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Web Price Results</h1>
        <p className="text-sm text-gray-500">
          Latest web_search entries saved to catalogPriceRecords.
        </p>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 font-semibold text-gray-600">Title</th>
              <th className="p-4 font-semibold text-gray-600">Price</th>
              <th className="p-4 font-semibold text-gray-600">Model</th>
              <th className="p-4 font-semibold text-gray-600 w-1/3">Notes/Context</th>
              <th className="p-4 font-semibold text-gray-600">Link</th>
              <th className="p-4 font-semibold text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody>
            {webPriceRecords.map((record: any) => (
              <tr key={record._id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium text-gray-900">{record.title ?? "-"}</td>
                
                <td className="p-4 font-bold text-gray-800">
                  {record.amount !== undefined 
                    ? `${Number(record.amount).toLocaleString()} ${record.currency ?? "NIS"}` 
                    : <span className="text-gray-400 italic">No price</span>}
                </td>

                <td className="p-4 text-xs">
                  <span className="px-2 py-1 bg-gray-100 rounded-md border border-gray-200">
                    {record.pricingModel ?? "unknown"}
                  </span>
                </td>

                <td className="p-4 text-sm text-gray-600">
                  {record.notesHe ? (
                    <div dir="rtl" className="whitespace-pre-wrap">{record.notesHe}</div>
                  ) : (
                    <div className="text-xs text-gray-400 truncate max-w-xs" title={record.rawSnippet}>
                      {record.rawSnippet}
                    </div>
                  )}
                </td>

                <td className="p-4 text-xs text-blue-600">
                  {record.url ? (
                    <a
                      href={record.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      Open ↗
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                
                <td className="p-4 text-xs text-gray-500 whitespace-nowrap">
                  {record.checkedAt ? new Date(record.checkedAt).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
            {webPriceRecords.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  No web price results yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
