import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { AppScreen } from "@/components/layout/AppScreen";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { LibrarySections } from "@/components/library/LibrarySections";
import { DocumentEmptyState } from "@/components/cv/DocumentEmptyState";
import { AccountSheet } from "@/components/cv/AccountSheet";
import { Notice } from "@/components/cv/Notice";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import Icon from "@/lib/icons/LucideIcon";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listTailoredCvs } from "@/lib/editor/api";
import type { TailoredCvSummary } from "@/lib/editor/types";
import { useTheme } from "@/theming/ThemeProvider";

const PAGE_SIZE = 30;
export default function TailoredCvsScreen() {
  const {session,loading:authLoading} = useAuth();
  const ownerId = session?.user.id;
  const {theme} = useTheme();
  const [accountOpen,setAccountOpen] = useState(false);
  const [state,setState] = useState<{owner:string|null;items:TailoredCvSummary[];loading:boolean;error:string|null;more:boolean}>({owner:null,items:[],loading:false,error:null,more:false});
  const request = useRef<AbortController|null>(null);
  const offset = useRef(0);
  const load = useCallback(async (reset = true) => {
    if (!ownerId) return;
    if (request.current && !reset) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if(reset) offset.current = 0;
    setState(v => ({owner:ownerId,items:v.owner === ownerId ? v.items:[],loading:true,error:null,more:reset ? false:v.more}));
    try {
      const rows = await listTailoredCvs(ownerId,controller.signal,offset.current,PAGE_SIZE);
      if(controller.signal.aborted) return;
      offset.current += rows.length;
      setState(v => ({owner:ownerId,items:reset ? rows : [...new Map([...v.items,...rows].map(row => [row.id,row])).values()],loading:false,error:null,more:rows.length === PAGE_SIZE}));
    } catch(e) {
      if(!controller.signal.aborted) setState(v => ({...v,loading:false,error:e instanceof Error ? e.message:"Your saved CVs could not be loaded. Try again."}));
    } finally {if(request.current === controller) request.current=null;}
  },[ownerId]);
  useFocusEffect(useCallback(() => { if(ownerId) void load(); return () => {request.current?.abort();request.current=null;}; },[ownerId,load]));
  const items = state.owner === ownerId ? state.items:[];
  const loading = authLoading || (state.owner === ownerId && state.loading);
  const error = state.owner === ownerId ? state.error:null;
  return (
    <AppScreen>
      <ScreenHeader title="Tailored CVs" />
      <LibrarySections selected="tailored" />
      <FlatList data={items} keyExtractor={item => item.id} contentContainerClassName="px-6 pb-10 gap-3" showsVerticalScrollIndicator={false}
        refreshing={loading && items.length > 0} onRefresh={() => void load()}
        ListHeaderComponent={<View className="gap-4 pb-4"><Text className="text-body leading-6 text-muted-foreground">Your tailored CVs, ready to refine and share.</Text>{error ? <View className="gap-3"><Notice tone="error" message={error}/><Button variant="outline" onPress={() => void load()}><Text>Try again</Text></Button></View>:null}</View>}
        ListEmptyComponent={loading ? <View className="items-center gap-3 py-16"><ActivityIndicator color={theme.colors.primary}/><Text className="text-body text-muted-foreground">Loading your CVs…</Text></View> : !ownerId ? <DocumentEmptyState icon="FileCheck" title="Your next opportunity starts here" description="Sign in to reopen, edit, and download your tailored CVs." action={<Button className="rounded-xl" onPress={() => setAccountOpen(true)}><Text>Sign in</Text></Button>}/> : !error ? <DocumentEmptyState icon="FileCheck" title="No tailored CVs yet" description="Tailor your CV to a role, then confirm and save it. It will be ready to edit here." action={<Button variant="outline" className="rounded-xl" onPress={() => router.navigate("/(tabs)/tailor")}><Text>Tailor a CV</Text></Button>}/> : null}
        renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={"Edit " + (item.job_title || "Tailored CV") + (item.company ? " for " + item.company:"")} onPress={() => router.push({pathname:"/cv-editor/[id]",params:{id:item.id}})} className="min-h-24 flex-row items-center gap-4 rounded-2xl border border-border bg-card p-4 active:opacity-70"><View className="h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Icon name="FileText" size={23} className="text-primary"/></View><View className="flex-1 gap-1"><Text numberOfLines={2} className="text-h5 text-foreground">{item.job_title || "Tailored CV"}</Text>{item.company ? <Text numberOfLines={1} className="text-body text-muted-foreground">{item.company}</Text>:null}<Text className="text-caption text-muted-foreground">Saved {Number.isFinite(Date.parse(item.updated_at)) ? new Date(item.updated_at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"recently"}</Text></View><Icon name="ChevronRight" size={20} className="text-muted-foreground"/></Pressable>}
        ListFooterComponent={state.more && ownerId ? <Button variant="outline" disabled={loading} onPress={() => void load(false)} className="mt-4 rounded-xl"><Text>{loading ? "Loading…":"Load more CVs"}</Text></Button>:null}
      />
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)}/>
    </AppScreen>
  );
}
