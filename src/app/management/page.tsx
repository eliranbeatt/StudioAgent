export default function ManagementPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Management Hub Dashboard</h1>
      <p className="text-gray-600 mb-8">
        This is the source of truth for all projects. Agents read from here.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Vendors</h3>
          <p className="text-3xl font-bold text-blue-600">--</p>
          <p className="text-sm text-gray-500">Active suppliers</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Catalog Items</h3>
          <p className="text-3xl font-bold text-green-600">--</p>
          <p className="text-sm text-gray-500">Standardized materials</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold mb-2">Price Observations</h3>
          <p className="text-3xl font-bold text-purple-600">--</p>
          <p className="text-sm text-gray-500">Learned price points</p>
        </div>
      </div>
    </div>
  );
}
