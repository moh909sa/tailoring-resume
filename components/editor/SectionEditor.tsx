import { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { AppSheet } from "@/components/layout/AppSheet";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import LucideIcon from "@/lib/icons/LucideIcon";
import { isJsonObject, type JsonObject, type JsonValue } from "@/lib/tailoring/types";
import { readableLabel } from "@/components/tailoring/ReviewContent";
import { editorMetadata, entryTemplate, plainText, sectionSummary, type EditorSection } from "./sections";

function TextField({ label, value, onChange, field }: { label:string; value:string; onChange:(value:string)=>void; field:string }) {
  const multiline = /summary|description|text|bullet/i.test(field) || value.length > 150;
  const formatted = /summary|description|text|bullet/i.test(field);
  const Field = multiline ? Textarea : Input;
  return <View className="gap-2">
    <Text className="text-caption font-medium text-muted-foreground">{label}</Text>
    <Field accessibilityLabel={label} value={formatted ? plainText(value) : value} onChangeText={(next)=>onChange(formatted ? next.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>") : next)} multiline={multiline}
      className={multiline ? "min-h-32 rounded-xl bg-card px-4 py-3 text-body leading-6" : "h-12 rounded-xl bg-card px-4 text-body"}
      keyboardType={/email/i.test(field) ? "email-address" : /phone/i.test(field) ? "phone-pad" : /website|linkedin|github|url/i.test(field) ? "url" : "default"}
      autoCapitalize={/email|website|linkedin|github|url/i.test(field) ? "none" : "sentences"} />
  </View>;
}

function ListEditor({ value, onChange, field, styles }: {
  value:JsonValue[]; onChange:(value:JsonValue[], styles?:JsonValue[])=>void; field:string;
  styles?:JsonValue[];
}) {
  const [active, setActive] = useState<number|null>(null);
  const [removing, setRemoving] = useState<number|null>(null);
  const objects = value.some(isJsonObject) || /experience|education|projects|items/i.test(field);
  const update = (index:number, next:JsonValue) => onChange(value.map((item,i) => i === index ? next : item));
  const remove = (index:number) => {
    onChange(value.filter((_,i) => i !== index), styles?.filter((_,i) => i !== index));
    setActive(null);
    setRemoving(null);
  };
  const move = (index:number, direction:number) => {
    const next = [...value];
    [next[index],next[index+direction]] = [next[index+direction],next[index]];
    if (styles) {
      const nextStyles = value.map((_,i) => styles?.[i] ?? "bullet");
      [nextStyles[index],nextStyles[index+direction]] = [nextStyles[index+direction],nextStyles[index]];
      onChange(next,nextStyles);
    } else onChange(next);
  };
  if (objects && active !== null && value[active] !== undefined) return <View className="gap-5">
    <Pressable accessibilityRole="button" onPress={() => {Keyboard.dismiss();setActive(null);}} className="min-h-11 flex-row items-center gap-2">
      <LucideIcon name="ArrowLeft" size={18} className="text-primary"/><Text className="text-body text-primary">All entries</Text>
    </Pressable>
    <ValueEditor value={value[active]} onChange={(next)=>update(active,next)} field={field}/>
  </View>;
  return <View className="gap-3">
    {value.map((item,index) => <View key={index} className="gap-3 rounded-2xl border border-border bg-card p-4">
      {objects ? <Pressable accessibilityRole="button" onPress={()=>setActive(index)} className="min-h-11 flex-row items-center gap-3">
        <View className="flex-1 gap-1"><Text className="text-body font-semibold text-foreground">{sectionSummary(item)}</Text><Text className="text-caption text-muted-foreground">Tap to edit entry</Text></View>
        <LucideIcon name="ChevronRight" size={18} className="text-muted-foreground"/>
      </Pressable> : <ValueEditor value={item} onChange={(next)=>update(index,next)} field={/description/i.test(field) ? "bullet" : field} label={/description/i.test(field) ? `Bullet ${index+1}` : `Item ${index+1}`}/>}
      <View className="flex-row items-center justify-end gap-2">
        <Button variant="ghost" size="icon" disabled={index === 0} accessibilityLabel={`Move item ${index+1} up`} onPress={()=>move(index,-1)}><LucideIcon name="ArrowUp" size={18} className="text-muted-foreground"/></Button>
        <Button variant="ghost" size="icon" disabled={index === value.length-1} accessibilityLabel={`Move item ${index+1} down`} onPress={()=>move(index,1)}><LucideIcon name="ArrowDown" size={18} className="text-muted-foreground"/></Button>
        <Button variant="ghost" size="icon" accessibilityLabel={`Remove item ${index+1}`} onPress={()=>{Keyboard.dismiss();setRemoving(index);}}><LucideIcon name="Trash2" size={18} className="text-destructive"/></Button>
      </View>
      {removing === index ? <View className="gap-3 rounded-xl bg-destructive/5 p-3"><Text className="text-body text-foreground">Remove this entry from your tailored CV?</Text><View className="flex-row gap-3"><Button variant="secondary" className="flex-1" onPress={()=>setRemoving(null)}><Text>Keep</Text></Button><Button variant="destructive" className="flex-1" onPress={()=>remove(index)}><Text>Remove</Text></Button></View></View> : null}
    </View>)}
    <Button variant="outline" className="min-h-12 flex-row gap-2 rounded-xl" onPress={()=>{
      const next = objects ? entryTemplate(field) : "";
      onChange([...value,next], styles ? [...styles,"bullet"] : undefined);
      if (objects) setActive(value.length);
    }}><LucideIcon name="Plus" size={18} className="text-primary"/><Text className="text-body text-primary">{objects ? "Add entry" : /description/i.test(field) ? "Add bullet" : "Add item"}</Text></Button>
  </View>;
}

function ObjectEditor({ value, onChange, field }: {value:JsonObject;onChange:(value:JsonObject)=>void;field:string}) {
  const template: JsonObject = /personalInfo/i.test(field) ? {name:"",title:"",email:"",phone:"",location:"",website:"",linkedin:"",github:""} : /experience|education|project|items/i.test(field) ? entryTemplate(field) : value.sectionType === "text" ? {text:""} : value.sectionType === "stringList" ? {strings:[]} : value.sectionType === "itemList" ? {items:[]} : {};
  const fields = {...template,...value};
  const update = (key:string,next:JsonValue) => onChange({...value,[key]:next});
  return <View className="gap-5">{Object.entries(fields).filter(([key])=>!editorMetadata.has(key)).map(([key,item])=>
    <View key={key} className="gap-2">
      {Array.isArray(item) ? <><Text className="text-body font-medium text-foreground">{key === "description" ? "Experience & achievements" : readableLabel(key)}</Text>
        <ListEditor value={item} onChange={(next,nextStyles)=>onChange({...value,[key]:next,...(nextStyles ? {descriptionStyles:nextStyles} : {})})} field={key} styles={Array.isArray(value.descriptionStyles) && key === "description" ? value.descriptionStyles : undefined}/></>
      : <ValueEditor value={item} onChange={(next)=>update(key,next)} field={key}/>}</View>)}
  </View>;
}

function ValueEditor({value,onChange,field,label}: {value:JsonValue;onChange:(value:JsonValue)=>void;field:string;label?:string}) {
  if (Array.isArray(value)) return <ListEditor value={value} onChange={onChange} field={field}/>;
  if (isJsonObject(value)) return <ObjectEditor value={value} onChange={onChange} field={field}/>;
  if (typeof value === "boolean") return <View className="flex-row items-center justify-between"><Text className="text-body text-foreground">{label ?? readableLabel(field)}</Text><Switch accessibilityLabel={label ?? readableLabel(field)} value={value} onValueChange={onChange}/></View>;
  return <TextField label={label ?? (field === "years" ? "Dates · e.g. Jan 2022 – Present" : readableLabel(field))} field={field} value={value === null ? "" : String(value)} onChange={(next)=>onChange(typeof value === "number" && next !== "" && Number.isFinite(Number(next)) ? Number(next) : next)}/>;
}

export function SectionEditor({section,onChange,onClose,saveLabel}: {
  section:EditorSection;onChange:(value:JsonValue)=>void;onClose:()=>void;saveLabel:string;
}) {
  return <AppSheet visible onClose={onClose}>
    <View className="min-h-16 flex-row items-center justify-between gap-3 border-b border-border px-5 py-3">
      <View className="flex-1 gap-1"><Text accessibilityRole="header" className="text-h4 text-foreground">{section.label}</Text><Text accessibilityLiveRegion="polite" className="text-caption text-muted-foreground">{saveLabel}</Text></View>
      <Button variant="ghost" onPress={()=>{Keyboard.dismiss();onClose();}}><Text className="text-primary">Done</Text></Button>
    </View>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} contentContainerClassName="gap-6 px-5 pb-12 pt-6">
        {section.hidden ? <Text className="text-caption text-muted-foreground">This section is currently hidden in your PDF.</Text> : null}
        <ValueEditor value={section.value} onChange={onChange} field={section.key}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </AppSheet>;
}
