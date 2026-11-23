import { useNavigate } from 'react-router';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WallpaperGuide } from './WallpaperGuide';

export default function GuidePage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6 sm:px-6 md:pt-10">
      <p className="eyebrow mb-1">Guide</p>
      <h1 className="mb-6 text-[28px] sm:text-[40px]">Set your lock screen</h1>
      <WallpaperGuide />
      <Button
        className="mt-8"
        onClick={() => navigate('/studio')}
        icon={<Smartphone className="size-4" strokeWidth={1.5} />}
      >
        Open the Studio
      </Button>
    </div>
  );
}
