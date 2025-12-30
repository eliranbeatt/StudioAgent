export default function ProposedPage() {
    return (
        <div className="max-w-4xl">
             <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold">Proposed Updates Queue</h1>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded p-6 text-center">
                <p className="text-yellow-800 font-medium">No pending proposals from agents.</p>
                <p className="text-yellow-600 text-sm mt-2">When an agent suggests a new Vendor or Catalog Item, it will appear here for your approval.</p>
            </div>
        </div>
    )
}