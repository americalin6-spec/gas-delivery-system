"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function GasSaaS() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [selectedType, setSelectedType] = useState("16kg");

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert("讀取失敗：" + JSON.stringify(error));
      return;
    }

    setTasks(data || []);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAddress.trim()) {
      alert("請輸入地址");
      return;
    }

    const { error } = await supabase.from("tasks").insert([
      {
        address: newAddress,
        type: selectedType,
        status: "待配送",
      },
    ]);

    if (error) {
      alert("新增失敗：" + JSON.stringify(error));
      return;
    }

    alert("新增成功");
    setNewAddress("");
    fetchTasks();
  };

  const completeTask = async (id: number) => {
    const { error } = await supabase
      .from("tasks")
      .update({ status: "送達" })
      .eq("id", id);

    if (error) {
      alert("更新失敗：" + JSON.stringify(error));
      return;
    }

    fetchTasks();
  };

  return (
    <main className="min-h-screen bg-black text-white p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-black text-orange-500 mb-6">
          瓦斯快送系統
        </h1>

        <form onSubmit={addTask} className="bg-zinc-900 p-4 rounded-3xl mb-6">
          <input
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="輸入地址"
            className="w-full p-4 rounded-2xl bg-zinc-800 text-white mb-4 text-xl"
          />

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full p-4 rounded-2xl bg-zinc-800 text-white mb-4 text-xl"
          >
            <option value="16kg">16kg</option>
            <option value="20kg">20kg</option>
            <option value="50kg">50kg</option>
          </select>

          <button
            type="submit"
            className="w-full bg-orange-500 p-5 rounded-2xl text-2xl font-black"
          >
            新增配送單
          </button>
        </form>

        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="bg-zinc-900 p-4 rounded-3xl">
              <div className="flex justify-between mb-4">
                <span className="bg-orange-500 px-3 py-1 rounded-full">
                  {task.type}
                </span>
                <span>{task.status}</span>
              </div>

              <div className="text-2xl font-bold mb-4 break-words">
                {task.address}
              </div>

              {task.status === "待配送" && (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      task.address
                    )}`}
                    target="_blank"
                    className="bg-zinc-700 p-4 rounded-2xl text-center text-xl font-bold"
                  >
                    導航
                  </a>

                  <button
                    type="button"
                    onClick={() => completeTask(task.id)}
                    className="bg-green-600 p-4 rounded-2xl text-xl font-bold"
                  >
                    完成
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}