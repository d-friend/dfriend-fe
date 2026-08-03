"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChalkboardTeacher, Plus } from "@phosphor-icons/react";
import { teacherApi } from "@/lib/api-client";

export default function ClassesPage() {
  const classes = useQuery({ queryKey: ["teacher", "classes"], queryFn: teacherApi.classes });
  if (classes.isLoading) return <div className="center-state"><div className="skeleton h-32 w-80" /></div>;
  if (classes.data?.length) return <div className="center-state"><ChalkboardTeacher size={32} /><h1>Chọn một lớp từ thanh bên</h1><Link className="primary-button" href={`/teacher/classes/${classes.data[0].class_id}?tab=students`}>Mở {classes.data[0].class_name}</Link></div>;
  return <div className="center-state"><ChalkboardTeacher size={32} /><h1>Chưa có lớp học</h1><p>Dùng nút cộng cạnh Lớp hiện tại để tạo lớp đầu tiên.</p><span className="secondary-button"><Plus size={16} /> Tạo lớp từ thanh bên</span></div>;
}
