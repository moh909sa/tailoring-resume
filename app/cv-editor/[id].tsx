import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@/components/layout/AppScreen";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/cv/Notice";
import LucideIcon from "@/lib/icons/LucideIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCvEditor } from "@/lib/editor/useCvEditor";
import { SectionEditor } from "@/components/editor/SectionEditor";
import { JobMatch } from "@/components/editor/JobMatch";
import { replaceSection, resumeSections, sectionSummary } from "@/components/editor/sections";
import { isJsonObject, type JsonValue } from "@/lib/tailoring/types";
import { cn } from "@/lib/utils";

const statusLabels = {saved:"All changes saved",saving:"Saving changes…",local:"Saved on this device · waiting to sync",error:"Changes need syncing",conflict:"Another saved version is available"};

export default function CvEditorScreen() {
  const {id} = useLocalSearchParams<{id:string}>();
  const {session} = useAuth();
  const editor = useCvEditor(typeof id === "string" ? id : "");
  const [view,setView] = useState<"edit"|"match">("edit");
  const [activeKey,setActiveKey] = useState<string|null>(null);
  const [openingPreview,setOpeningPreview] = useState(false);
  const [actionError,setActionError] = useState<string|null>(null);
  const insets = useSafeAreaInsets();
  const sections = editor.resume ? resumeSections(editor.resume) : [];
  const section = sections.find(s=>s.key === activeKey);
  const document = editor.document;
  const initialMatch = useRef<string | null>(null);
  useEffect(() => {
    if (view !== "match" || !document || editor.analysis || editor.analysisLoading || editor.saveState !== "saved" || initialMatch.current === document.tailoring_id) return;
    initialMatch.current = document.tailoring_id;
    void editor.refreshAnalysis();
  }, [view, document, editor.analysis, editor.analysisLoading, editor.saveState, editor.refreshAnalysis]);
  const leave = () => {Keyboard.dismiss();void editor.flush();if(router.canGoBack()) router.back();else router.replace("/(tabs)/library/tailored-cvs");};
  const openSection = (key:string) => {
    setView("edit");
    const found = sections.find(s=>key === "skills" ? /technicalSkills|professionalSkills|skills$/i.test(s.key) : key === "workExperience" ? /workExperience|experience$/.test(s.key) : s.key === key);
    if(found) setActiveKey(found.key);
  };
  const addSkill = (skill:string) => {
    if(!editor.resume || !document) return;
    const skillsSection = sections.find(s=>/technicalSkills|professionalSkills|skills$/i.test(s.key) && Array.isArray(s.value));
    const current = skillsSection && Array.isArray(skillsSection.value) ? skillsSection.value : [];
    const key = skillsSection?.key ?? "additional.technicalSkills";
    let next = current.some(v=>typeof v === "string" && v.toLocaleLowerCase() === skill.toLocaleLowerCase()) ? editor.resume : replaceSection(editor.resume,key,[...current,skill]);
    if(Array.isArray(next.sectionMeta)) next = {...next,sectionMeta:next.sectionMeta.map(meta=>isJsonObject(meta) && (meta.key === key || meta.key === key.split(".").pop()) ? {...meta,isVisible:true} : meta)};
    editor.updateResume(next,Array.from(new Set([...editor.confirmedSkills,skill])));
  };
  const preview = async () => {
    if(openingPreview) return;
    setOpeningPreview(true);setActionError(null);Keyboard.dismiss();
    try {
      const saved = await editor.flush();
      if(saved) router.push({pathname:"/cv-editor/[id]/preview",params:{id:saved.tailoring_id,revision:String(saved.revision)}});
      else setActionError("Save your latest changes before opening the PDF preview. Your edits are kept on this device.");
    } catch(error) {setActionError(error instanceof Error ? error.message : "The CV could not be saved. Please try again.");}
    finally {setOpeningPreview(false);}
  };
  return <AppScreen>
    <View className="min-h-16 flex-row items-center gap-3 px-5 py-3">
      <Button variant="ghost" size="icon" accessibilityLabel="Back to saved CVs" onPress={leave}><LucideIcon name="ChevronLeft" size={24} className="text-foreground"/></Button>
      <View className="flex-1"><Text accessibilityRole="header" className="text-h3 text-foreground">CV Editor</Text><Text numberOfLines={1} className="text-caption text-muted-foreground">{[document?.job.title,document?.job.company].filter(Boolean).join(" · ") || "Your tailored CV"}</Text></View>
    </View>
    {editor.loading ? <View className="flex-1 items-center justify-center gap-4"><ActivityIndicator/><Text className="text-body text-muted-foreground">Opening your saved CV…</Text></View>
    : !document || !editor.resume ? <View className="flex-1 justify-center gap-4 px-6"><Notice tone="error" message={editor.error ?? "This CV could not be opened."}/><Button onPress={()=>session ? void editor.reload() : router.replace("/(tabs)/library/my-cvs")}><Text>{session ? "Try again" : "Go to My CVs to sign in"}</Text></Button></View>
    : <>
      <View className="gap-4 px-6 pb-4">
        <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
          <LucideIcon name={editor.saveState === "saved" ? "CloudCheck" : editor.saveState === "conflict" || editor.saveState === "error" ? "CircleAlert" : "CloudUpload"} size={15} className={editor.saveState === "saved" ? "text-success" : "text-muted-foreground"}/>
          <Text className="text-caption text-muted-foreground">{statusLabels[editor.saveState]}</Text>
        </View>
        <View className="flex-row rounded-2xl bg-muted p-1">
          {(["edit","match"] as const).map(tab=><Pressable key={tab} accessibilityRole="tab" accessibilityState={{selected:view === tab}} onPress={()=>setView(tab)} className={cn("min-h-11 flex-1 items-center justify-center rounded-xl",view === tab && "bg-card")}><Text className={cn("text-body font-medium",view === tab ? "text-foreground" : "text-muted-foreground")}>{tab === "edit" ? "Edit CV" : "Job Match"}</Text></Pressable>)}
        </View>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-6 pb-8" keyboardShouldPersistTaps="handled">
        {editor.problem || actionError ? <View className="gap-3"><Notice tone="error" message={actionError ?? editor.problem ?? "Your edits need syncing."}/>{editor.saveState !== "conflict" ? <Button variant="outline" onPress={()=>{setActionError(null);void editor.flush();}}><Text>Retry saving</Text></Button> : null}</View> : null}
        {editor.saveState === "conflict" ? <View className="gap-3 rounded-2xl border border-border bg-card p-4"><Text className="text-body text-foreground">Choose which version to continue with. Your edits stay on this device until you decide.</Text><Button onPress={()=>void editor.resolveConflict("local")}><Text>Keep my edits</Text></Button><Button variant="outline" onPress={()=>void editor.resolveConflict("server")}><Text>Use the saved version</Text></Button></View> : null}
        {view === "edit" ? <View className="gap-5">
          <View className="gap-1"><Text className="text-h4 text-foreground">Make it yours</Text><Text className="text-body leading-6 text-muted-foreground">Refine your experience and highlight the skills you have. Changes save automatically.</Text></View>
          <View className="overflow-hidden rounded-2xl border border-border bg-card">{sections.map((s,index)=><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${s.label}`} key={s.key} onPress={()=>setActiveKey(s.key)} className={cn("min-h-24 flex-row items-center gap-4 px-5 py-4 active:bg-muted",index > 0 && "border-t border-border")}>
            <View className="flex-1 gap-1.5"><Text className="text-body font-semibold text-foreground">{s.label}</Text><Text numberOfLines={2} className="text-caption leading-5 text-muted-foreground">{s.hidden ? "Hidden in PDF · " : ""}{sectionSummary(s.value)}</Text></View><LucideIcon name="ChevronRight" size={18} className="text-muted-foreground"/>
          </Pressable>)}</View>
          <View className="flex-row items-center gap-2"><LucideIcon name="ShieldCheck" size={16} className="text-muted-foreground"/><Text className="flex-1 text-caption leading-5 text-muted-foreground">Your original CV stays unchanged.</Text></View>
        </View> : <JobMatch analysis={editor.analysis} revision={document.revision} dirty={editor.saveState !== "saved"} loading={editor.analysisLoading} jobDescription={document.job.description} confirmedSkills={editor.confirmedSkills} onRefresh={()=>void editor.refreshAnalysis()} onAddSkill={addSkill} onEdit={openSection}/>}
      </ScrollView>
      <View className="gap-2 border-t border-border bg-background px-6 pt-4" style={{paddingBottom:Math.max(insets.bottom,16)}}><Button disabled={openingPreview || editor.saveState === "conflict"} onPress={()=>void preview()} className="min-h-14 flex-row gap-2 rounded-2xl">{openingPreview ? <ActivityIndicator/> : <LucideIcon name="FileText" size={20} className="text-primary-foreground"/>}<Text>{openingPreview ? "Saving your CV…" : "Preview PDF"}</Text></Button></View>
      {section ? <SectionEditor key={section.key} section={section} saveLabel={statusLabels[editor.saveState]} onChange={(value:JsonValue)=>{if(editor.resume) editor.updateResume(replaceSection(editor.resume,section.key,value));}} onClose={()=>{setActiveKey(null);void editor.flush();}}/> : null}
    </>}
  </AppScreen>;
}
