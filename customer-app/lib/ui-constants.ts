import {
    Grid,
    Hammer, Paintbrush,
    Shield,
    Snowflake,
    Sprout, Wrench, Zap
} from 'lucide-react-native';

export const PRIMARY = '#1A3FFF';

export const getIconForCategory = (slug: string) => {
    const map: Record<string, any> = {
        'cleaning': Sprout,
        'plumbing': Wrench,
        'electrician': Zap,
        'ac-service': Snowflake,
        'pest-control': Shield,
        'appliance-repair': Hammer,
        'paint': Paintbrush,
    };
    return map[slug] || Grid;
};

export const getBgForCategory = (slug: string) => {
    const map: Record<string, string> = {
        'cleaning': '#E8F5E9',
        'plumbing': '#E3F2FD',
        'electrician': '#FFFDE7',
        'ac-service': '#E0F7FA',
        'pest-control': '#F3E5F5',
        'appliance-repair': '#FFF3E0',
        'paint': '#FCE4EC',
    };
    return map[slug] || '#F5F5F5';
};

export const getColorForCategory = (slug: string) => {
    const map: Record<string, string> = {
        'cleaning': '#388E3C',
        'plumbing': '#1976D2',
        'electrician': '#FBC02D',
        'ac-service': '#0097A7',
        'pest-control': '#7B1FA2',
        'appliance-repair': '#F57C00',
        'paint': '#D81B60',
    };
    return map[slug] || '#666';
};
