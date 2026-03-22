import { Check } from 'lucide-react';

interface SidebarProps {
  selectedSections: string[];
  onSectionsChange: (sections: string[]) => void;
}

// Sidebar shows high-level domains. Each domain maps to multiple tools in the backend.
const sections = [
  { id: 'chat_ai', label: 'AI Chat (GPT, EaseMate, TalkAI)' },
  { id: 'image_generation', label: 'Image Generation' },
  { id: 'documents', label: 'Documents (PDF / Word / Convert)' },
  { id: 'search_news', label: 'Search & News' },
  { id: 'science', label: 'Science Tools (Math / Physics / Chemistry / Biology)' },
  { id: 'medical_info_tool', label: 'Medical Info' },
];

export function Sidebar({ selectedSections, onSectionsChange }: SidebarProps) {
  const toggleSection = (sectionId: string) => {
    if (selectedSections.includes(sectionId)) {
      onSectionsChange(selectedSections.filter((id) => id !== sectionId));
    } else {
      onSectionsChange([...selectedSections, sectionId]);
    }
  };

  return (
    <div className="w-80 backdrop-blur-xl bg-white/5 border-l border-white/10 p-6 overflow-y-auto relative z-10">
      <h2 className="mb-6 text-white">Tool Kit</h2>
      <div className="space-y-3">
        {sections.map((section) => {
          const isSelected = selectedSections.includes(section.id);
          return (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${
                isSelected
                  ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/50 shadow-lg'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-transparent shadow-lg'
                    : 'border-white/30 bg-white/5 group-hover:border-white/50'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <span
                className={`transition-colors ${isSelected ? 'text-white' : 'text-purple-100/80 group-hover:text-white'}`}
              >
                {section.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}