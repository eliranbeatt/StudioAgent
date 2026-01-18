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
              <th className="p-4 font-semibold text-gray-600">URL</th>
              <th className="p-4 font-semibold text-gray-600">Checked</th>
            </tr>
          </thead>
          <tbody>
            {webPriceRecords.map((record: any) => (
              <tr key={record._id} className="border-b">
                <td className="p-4">{record.title ?? "-"}</td>
                <td className="p-4 text-xs text-blue-600 break-all">
                  {record.url ? (
                    <a
                      href={record.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {record.url}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="p-4 text-xs text-gray-500">
                  {record.checkedAt ? new Date(record.checkedAt).toLocaleDateString() : "-"}
                </td>
              </tr>
            ))}
            {webPriceRecords.length === 0 && (
              <tr>
                <td colSpan={3} className="p-6 text-center text-gray-500">
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
