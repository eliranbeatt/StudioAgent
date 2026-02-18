"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import { X, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";

interface NewProjectDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

const PROJECT_TYPES = [
    { id: "studio_build", label: "Studio Build" },
    { id: "printing", label: "Printing" },
    { id: "install", label: "Install" },
    { id: "teardown", label: "Teardown" },
    { id: "procurement", label: "Procurement" },
    { id: "design", label: "Design" },
];

const PROJECT_STATUSES = [
    { id: "lead", label: "Lead" },
    { id: "production", label: "Production" },
    { id: "done", label: "Done" },
    { id: "rejected", label: "Rejected" },
];

export default function NewProjectDialog({ isOpen, onClose }: NewProjectDialogProps) {
    const router = useRouter();
    const createProject = useMutation(api.projects.createProjectFromModal);
    const customers = useQuery(api.customers.listActive) || [];
    const featureFlags = useQuery(api.featureFlags.getAll);
    const wizardBrainDumpEnabled = !!featureFlags?.ff_wizard_brain_dump;

    // Form State
    const [name, setName] = useState("");
    const [customerId, setCustomerId] = useState("");
    const [customerSearch, setCustomerSearch] = useState("");
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [elements, setElements] = useState<string[]>([""]);
    const [eventDate, setEventDate] = useState("");
    const [notes, setNotes] = useState("");
    const [brainDumpRaw, setBrainDumpRaw] = useState("");
    const [status, setStatus] = useState("lead");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form on open
    useEffect(() => {
        if (isOpen) {
            setName("");
            setCustomerId("");
            setCustomerSearch("");
            setSelectedTypes([]);
            setElements([""]);
            setEventDate("");
            setNotes("");
            setBrainDumpRaw("");
            setStatus("lead");
            setIsSubmitting(false);
        }
    }, [isOpen]);

    // Customer Autocomplete Logic
    const filteredCustomers = customers.filter((c) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase())
    );
    const showCreateOption = customerSearch.trim() !== "" && !customers.some(c => c.name.toLowerCase() === customerSearch.trim().toLowerCase());

    const handleSelectCustomer = (cust: any) => {
        setCustomerId(cust._id);
        setCustomerSearch(cust.name);
        setIsCustomerDropdownOpen(false);
    };

    const handleCreateCustomer = () => {
        setCustomerId(""); // Will trigger "create new" in backend if name is provided
        setIsCustomerDropdownOpen(false);
    };

    // Element List Logic
    const handleAddElement = () => setElements([...elements, ""]);
    const handleRemoveElement = (index: number) => {
        const newEls = [...elements];
        newEls.splice(index, 1);
        setElements(newEls);
    };
    const handleElementChange = (index: number, val: string) => {
        const newEls = [...elements];
        newEls[index] = val;
        setElements(newEls);
    };

    const handleSave = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const cleanElements = elements.map(e => e.trim()).filter(Boolean);

            const projectId = await createProject({
                name: name.trim() || undefined,
                customerId: customerId ? (customerId as any) : undefined,
                customerNameNew: !customerId ? customerSearch.trim() : undefined,
                types: selectedTypes,
                eventDate: eventDate || undefined,
                notes: notes || undefined,
                brainDumpRaw: wizardBrainDumpEnabled ? (brainDumpRaw || undefined) : undefined,
                status: status as any,
                elements: cleanElements,
            });

            onClose();
            router.push(`/projects/${projectId}`);
        } catch (error) {
            console.error("Failed to create project:", error);
            alert("Failed to create project. See console for details.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-start p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">New Project</h2>
                        <p className="text-sm text-gray-500 mt-1">Create project basics. Summary will be generated automatically after saving.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* 1. Project Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Project Name</label>
                            <input
                                type="text"
                                placeholder="If empty, we'll use date & time"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div className="space-y-2 relative">
                            <label className="text-sm font-medium text-gray-700">Customer</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Select or type new..."
                                    value={customerSearch}
                                    onChange={(e) => {
                                        setCustomerSearch(e.target.value);
                                        if (customerId) setCustomerId(""); // Clear selection on edit
                                        setIsCustomerDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsCustomerDropdownOpen(true)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button
                                    className="absolute right-2 top-2.5 text-gray-400"
                                    onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                                >
                                    <ChevronsUpDown size={14} />
                                </button>
                            </div>

                            {isCustomerDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                    {filteredCustomers.length > 0 && (
                                        <div className="p-1">
                                            {filteredCustomers.map(cust => (
                                                <div
                                                    key={cust._id}
                                                    onClick={() => handleSelectCustomer(cust)}
                                                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer rounded text-sm text-gray-700 flex justify-between"
                                                >
                                                    {cust.name}
                                                    {customerId === cust._id && <Check size={14} className="text-blue-600" />}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {showCreateOption && (
                                        <div
                                            onClick={handleCreateCustomer}
                                            className="p-2 border-t border-gray-100 cursor-pointer hover:bg-blue-50 text-blue-600 text-sm font-medium flex items-center gap-2"
                                        >
                                            <Plus size={14} /> Create &quot;{customerSearch}&quot;
                                        </div>
                                    )}
                                    {filteredCustomers.length === 0 && !showCreateOption && (
                                        <div className="p-3 text-sm text-gray-500 text-center">Type to create new</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Type */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Type</label>
                        <div className="flex flex-wrap gap-2">
                            {PROJECT_TYPES.map((type) => {
                                const isSelected = selectedTypes.includes(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => {
                                            if (isSelected) setSelectedTypes(selectedTypes.filter(t => t !== type.id));
                                            else setSelectedTypes([...selectedTypes, type.id]);
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isSelected
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                                            }`}
                                    >
                                        {type.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 4. Elements */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-gray-700">Elements</label>
                            <button onClick={handleAddElement} className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium">
                                <Plus size={12} /> Add Element
                            </button>
                        </div>
                        <div className="space-y-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
                            {elements.map((el, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={el}
                                        onChange={(e) => handleElementChange(idx, e.target.value)}
                                        placeholder="Element name (e.g. Main Stage)"
                                        className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                                        autoFocus={idx === elements.length - 1 && idx > 0} // Auto focus new rows
                                    />
                                    {elements.length > 1 && (
                                        <button onClick={() => handleRemoveElement(idx)} className="text-gray-400 hover:text-red-500 px-1">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 5. Date & Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Event Date</label>
                            <input
                                type="date"
                                value={eventDate}
                                onChange={(e) => setEventDate(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                {PROJECT_STATUSES.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 6. Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Notes / Brief</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Key constraints, design direction, or important details..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[100px]"
                        />
                    </div>

                    {wizardBrainDumpEnabled ? (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Brain Dump (optional)</label>
                            <textarea
                                value={brainDumpRaw}
                                onChange={(e) => setBrainDumpRaw(e.target.value)}
                                placeholder="Paste raw ideas, constraints, and details. We'll parse this later."
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[140px]"
                            />
                            <p className="text-xs text-gray-500">Shown only when ff_wizard_brain_dump is enabled.</p>
                        </div>
                    ) : null}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting}
                        className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>Saving...</>
                        ) : (
                            <>Save Project</>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
