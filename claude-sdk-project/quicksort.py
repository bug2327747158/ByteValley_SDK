def quicksort(arr):
    """
    快速排序算法 - 简洁高效实现
    时间复杂度: 平均 O(n log n), 最坏 O(n²)
    空间复杂度: O(log n) 递归栈深度
    """
    if len(arr) <= 1:
        return arr
    
    # 选择中间元素作为基准值（避免最坏情况）
    pivot = arr[len(arr) // 2]
    
    # 三路划分：小于、等于、大于基准值
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    
    return quicksort(left) + middle + quicksort(right)


def quicksort_inplace(arr, low=0, high=None):
    """
    原地快速排序 - 节省空间
    时间复杂度: 平均 O(n log n), 最坏 O(n²)
    空间复杂度: O(log n)
    """
    if high is None:
        high = len(arr) - 1
    
    if low < high:
        # 分区并获取基准值位置
        pivot_idx = partition(arr, low, high)
        
        # 递归排序左右子数组
        quicksort_inplace(arr, low, pivot_idx - 1)
        quicksort_inplace(arr, pivot_idx + 1, high)
    
    return arr


def partition(arr, low, high):
    """
    Lomuto 分区方案
    """
    # 选择最后一个元素作为基准值
    pivot = arr[high]
    i = low - 1
    
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1


# 测试代码
if __name__ == "__main__":
    # 测试数据
    test_arrays = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 2, 8, 1, 9, 3, 7],
        [1],
        [],
        [3, 3, 3, 3],
        list(range(10, 0, -1))  # 逆序数组
    ]
    
    print("=" * 50)
    print("快速排序测试")
    print("=" * 50)
    
    for i, arr in enumerate(test_arrays, 1):
        # 复制数组用于测试不同版本
        arr_copy1 = arr.copy()
        arr_copy2 = arr.copy()
        
        # 测试简洁版
        sorted1 = quicksort(arr_copy1)
        
        # 测试原地版
        sorted2 = quicksort_inplace(arr_copy2)
        
        print(f"\n测试 {i}:")
        print(f"原数组:  {arr}")
        print(f"简洁版:  {sorted1}")
        print(f"原地版:  {sorted2}")
        
        # 验证结果正确性
        assert sorted1 == sorted(arr), "简洁版结果错误！"
        assert sorted2 == sorted(arr), "原地版结果错误！"
    
    print("\n" + "=" * 50)
    print("✓ 所有测试通过！")
    
    # 性能测试
    import random
    import time
    
    print("\n" + "=" * 50)
    print("性能测试（10000个随机数）")
    print("=" * 50)
    
    large_array = [random.randint(1, 10000) for _ in range(10000)]
    
    # 测试简洁版
    start = time.time()
    quicksort(large_array.copy())
    time1 = time.time() - start
    
    # 测试原地版
    start = time.time()
    quicksort_inplace(large_array.copy())
    time2 = time.time() - start
    
    # 测试内置排序
    start = time.time()
    sorted(large_array)
    time3 = time.time() - start
    
    print(f"简洁版快速排序: {time1:.4f} 秒")
    print(f"原地快速排序:   {time2:.4f} 秒")
    print(f"Python内置排序: {time3:.4f} 秒")
